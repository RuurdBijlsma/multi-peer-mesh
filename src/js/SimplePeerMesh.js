import Peer from "simple-peer";
import socketIo from "socket.io-client";

export default class SimplePeerMesh {
    constructor() {
        this.socket = null;
        this.url = '';
        this.peers = {};
        this._events = {};
        this.printDebug = false;
        this.roomCount = -1;
    }

    join(room) {
        // Waiting for this promise is dangerous, room count might be incorrect on the server due to bad disconnect
        return new Promise(resolve => {
            this.socket.emit('join', room);
            let roomCountEventCallback;
            roomCountEventCallback = () => {
                if (this.roomCount === 1) // Alone in the room
                    resolve();
                else { // Wait until all peer connections are complete
                    let fullConnectEventCallback;
                    fullConnectEventCallback = () => {
                        resolve();
                        this.off('fullConnect', fullConnectEventCallback);
                    };
                    this.on('fullConnect', fullConnectEventCallback);
                }
                this.off('roomCount', roomCountEventCallback);
            };
            this.on('roomCount', roomCountEventCallback);
        });
    }

    connect(url) {
        return new Promise(resolve => {
            this.url = url;
            this.socket = socketIo(url);

            this.socket.on('roomCount', roomCount => {
                this.roomCount = roomCount;
                this.log("New room count: " + roomCount + " users");
                this.fire('roomCount', roomCount);
                this.checkFullConnect();
            });

            this.socket.on('connect', () => {
                resolve(this.socket);
                this.log("Connected to socket server");
            });
            this.socket.on('socketId', mySocketId => {
                this.log(`My socket id = ${mySocketId}`);
            });
            this.socket.on('initialize', socketId => {
                this.log("Initializing with ", socketId);
                this.peers[socketId] = this.createPeer(socketId, true);
            });
            this.socket.on('destroy', socketId => {
                if (this.peers.hasOwnProperty(socketId)) {
                    this.peers[socketId].destroy();
                    delete this.peers[socketId];
                    this.fire('disconnect', socketId);
                    this.log("Destroying peer", socketId, "peer count:", this.getConnectedPeerCount());
                } else {
                    this.log("Unable to destroy peer, it does not exist");
                }
            });
            this.socket.on('signal', ([socketId, signal]) => {
                this.log("Receiving signal from ", socketId);

                if (!this.peers.hasOwnProperty(socketId)) {
                    this.log(`${socketId} is initializing with me`);
                    this.peers[socketId] = this.createPeer(socketId, false);
                }

                this.log(`Signalling ${socketId}`);
                this.peers[socketId].signal(signal);
            });
        })
    }

    broadcast(message) {
        this.log(`Broadcasting to ${this.getConnectedPeerCount()} peers: ${message}`);
        for (let peer in this.peers)
            if (this.peers.hasOwnProperty(peer))
                if (this.peers[peer] !== null)
                    this.peers[peer].write(message);
    }

    createPeer(socketId, initiator) {
        let peer = new Peer({initiator, trickle: true});
        peer.on("error", err => {
            this.fire("error", {peer, error: err, initiator, socketId});
            this.log("error", err)
        });

        peer.on("signal", data => {
            this.log(`Emitting signal to socket: ${socketId}`);
            this.socket.emit('message', [socketId, 'signal', data]);
        });

        peer.on("connect", () => {
            this.fire('connect', socketId);
            let peerCount = this.getConnectedPeerCount();
            this.log("New peer connection, peer count: ", peerCount);
            this.checkFullConnect();
        });

        peer.on("data", data => {
            this.fire('data', data);
            this.log("data: " + data);
        });

        peer.on("stream", stream => {
            this.fire('stream', stream);
            this.log("stream: ", stream);
        });

        peer.on("track", (track, stream) => {
            this.fire('track', track, stream);
            this.log("track: ", track, 'stream', stream);
        });

        peer.on("close", () => this.log("Peer connection closed", peer));

        return peer;
    }

    getConnectedPeerCount() {
        let count = 0;
        for (let peer in this.peers)
            if (this.peers.hasOwnProperty(peer))
                if (this.peers[peer].connected) count++;
        return count;
    }

    checkFullConnect() {
        let peerCount = this.getConnectedPeerCount();
        if (peerCount + 1 >= this.roomCount) {
            this.log("Fully connected to room, peer count: ", peerCount, 'room count: ', this.roomCount);
            this.fire("fullConnect");
        }
    }

    off(event, fun) {
        if (this._events.hasOwnProperty(event))
            this._events[event].splice(this._events[event].indexOf(fun), 1);
    }

    on(event, fun) {
        if (!this._events.hasOwnProperty(event))
            this._events[event] = [];
        this._events[event].push(fun);
    }

    fire(event, ...parameters) {
        if (this._events.hasOwnProperty(event))
            for (let fun of this._events[event])
                fun(...parameters);
    }

    log(...msg) {
        if (this.printDebug)
            console.log(...msg);
    }
}
