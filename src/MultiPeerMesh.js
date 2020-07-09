import Peer from 'simple-peer'
import EventEmitter from 'events';
import SignalModule from "multi-signal-server";

export default class MultiPeerMesh extends EventEmitter {
    constructor(appName, trickle = true, wrtc = false) {
        super();
        this.wrtc = wrtc;
        this.appName = appName;
        this.trickle = trickle;
        this.peers = {};
        this.printDebug = true;
        this.room = '';
        this.broadcastedStream = null;

        this.signal = new SignalModule(appName);
    }

    get url() {
        return this.signal.url;
    }

    async getServerRooms(url) {
        if (url[url.length - 1] !== '/')
            url += '/';
        try {
            let response = await fetch(url + 'rooms');
            return (await response.json()).filter(room => room.appName === this.appName)
        } catch (e) {
            return null
        }
    }

    async create(room, password = '', hidden = false) {
        this.signal.create(this.appName, room, password, hidden);
    }

    async join(room, password = '') {
        this.signal.join(this.appName, room, password);
        this.room = room;
        let roomCount = await this.signal.waitFor('room-count', 5000);
        this.checkFullConnect()
        if (roomCount !== 1)
            await this.waitFor('full-connect', 10000);
    }

    // On node/electron webSocketOnly might be necessary
    async connect(url, webSocketOnly = false) {
        await this.signal.connect(url, webSocketOnly);

        this.signal.on('room-count', roomCount => {
            this.emit('room-count', roomCount);
            this.checkFullConnect()
        });

        this.signal.on('socket-id', mySocketId => {
            this.emit('socket-id', mySocketId);
        });

        this.signal.on('initialize', (host, socketId) => {
            this.log('Initializing with ', socketId);
            this.peers[socketId] = this.createPeer(socketId, true)
        });

        this.signal.on('destroy', socketId => {
            if (this.peers.hasOwnProperty(socketId)) {
                try {
                    this.peers[socketId].destroy();
                } catch (e) {
                    //ignored, peer might already be destroyed error
                }
                delete this.peers[socketId];
                this.emit('disconnect', socketId);
                this.log('Destroying peer', socketId, 'peer count:', this.getConnectedPeerCount())
            } else {
                this.log('Unable to destroy peer, it does not exist')
            }
        });
        this.signal.on('signal', (socketId, signal) => {
            this.log('Receiving signal from ', socketId);

            if (!this.peers.hasOwnProperty(socketId)) {
                this.log(`${socketId} is initializing with me`);
                this.peers[socketId] = this.createPeer(socketId, false)
            }

            this.log(`Signalling ${socketId}`, signal);
            this.peers[socketId].signal(signal)
        })
    }

    broadcast(message) {
        this.log(`Broadcasting to ${this.getConnectedPeerCount()} peers: ${message}`);
        for (let peer in this.peers)
            if (this.peers.hasOwnProperty(peer) && this.peers[peer] !== null) {
                console.log('broadcasting ', message);
                if (typeof message === 'string')
                    this.peers[peer].send(message);
                else
                    this.peers[peer].send(JSON.stringify(message));
            }
    }

    send(id, message) {
        this.log(`Sending to ${id}: ${message}`);

        if (this.peers.hasOwnProperty(id) && this.peers[id] !== null) {
            console.log('broadcasting ', message);
            if (typeof message === 'string')
                this.peers[id].send(message);
            else
                this.peers[id].send(JSON.stringify(message));
        }
    }

    broadcastStream(stream) {
        this.broadcastedStream = stream;
        this.log(`Broadcasting stream to ${this.getConnectedPeerCount()} peers: ${stream}`);
        for (let peer in this.peers) {
            if (this.peers.hasOwnProperty(peer)) {
                if (this.peers[peer] !== null) {
                    this.peers[peer].addStream(stream)
                }
            }
        }
    }

    sendStream(id, stream) {
        this.log(`Sending stream to ${id}: ${stream}`);
        if (this.peers.hasOwnProperty(id && this.peers[id] !== null))
            this.peers[id].addStream(stream);
    }

    removeStream(id, stream) {
        this.log(`Removing stream to ${id}: ${stream}`);
        if (this.peers.hasOwnProperty(id && this.peers[id] !== null))
            this.peers[id].removeStream(stream);
    }

    broadcastRemoveStream(stream) {
        this.broadcastedStream = null;
        this.log(`broadcastRemoveStream to ${this.getConnectedPeerCount()} peers: ${stream}`);
        for (let peer in this.peers)
            if (this.peers.hasOwnProperty(peer) && this.peers[peer] !== null)
                this.peers[peer].removeStream(stream);
    }

    createPeer(socketId, initiator) {
        let options = {initiator, trickle: this.trickle};
        if (this.wrtc) {
            options.wrtc = this.wrtc;
            this.log('Using wrtc', options)
        }
        if (this.broadcastedStream !== null) {
            options.stream = this.broadcastedStream;
        }
        let peer = new Peer(options);
        peer.on('error', err => {
            console.warn(err);
            this.emit('error', peer, socketId, {peer, error: err, initiator});
            this.log('error', err)
        });

        peer.on('signal', data => {
            this.log(`Emitting signal to socket: ${socketId}`);
            this.signal.message(socketId, 'signal', data)
        });

        peer.on('connect', () => {
            let peerCount = this.getConnectedPeerCount();
            this.log('New peer connection, peer count: ', peerCount);
            this.emit('connect', socketId);
            this.checkFullConnect();
        });

        peer.on('data', data => {
            this.emit('data', socketId, data);
            this.log('data: ' + data)
        });

        peer.on('stream', stream => {
            console.log("Stream received!");
            this.emit('stream', socketId, stream);
            this.log('stream: ', stream)
        });

        peer.on('track', (track, stream) => {
            this.emit('track', track, socketId, stream);
            this.log('track: ', track, 'stream', stream)
        });

        peer.on('close', () => this.log('Peer connection closed', peer));

        return peer
    }

    getConnectedPeerCount() {
        let count = 0;
        for (let peer in this.peers) {
            if (this.peers.hasOwnProperty(peer)) {
                if (this.peers[peer].connected) count++
            }
        }
        return count
    }

    checkFullConnect() {
        if (this.isFullyConnected())
            this.emit('full-connect');
    }

    isFullyConnected() {
        let peerCount = this.getConnectedPeerCount();
        return peerCount + 1 >= this.signal.roomCount;
    }

    destroy() {
        this.signal.destroy();
        for (let peer in this.peers)
            if (this.peers.hasOwnProperty(peer)) {
                try {
                    this.peers[peer].destroy();
                } catch (e) {
                    //ignored, peer might already be destroyed error
                }
                delete this.peers[peer];
            }
    }

    log(...msg) {
        if (this.printDebug) {
            console.log(...msg)
        }
    }

    async waitFor(event, timeout = false) {
        return new Promise((resolve, reject) => {
            let rejectTimeout;
            if (timeout !== false) {
                rejectTimeout = setTimeout(() => {
                    reject('Timeout while waiting for event ' + event + ' to fire (timeout: ' + timeout + 'ms)');
                }, +timeout);
            }
            this.once(event, (...params) => {
                if (timeout !== false) {
                    clearTimeout(rejectTimeout)
                }
                resolve(...params);
            });
        });
    }
}