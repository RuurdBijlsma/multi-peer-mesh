<template>
    <div id="app">
    </div>
</template>

<script>
    import SimplePeerMesh from '@/js/SimplePeerMesh.js';


    export default {
        name: "app",
        components: {},
        data() {
            return {};
        },
        async mounted() {
            let mesh = new SimplePeerMesh();
            mesh.printDebug = true;
            await mesh.connect("http://localhost:3000");
            await mesh.join('default');

            mesh.on('connect', id => console.log('Connect', id));
            mesh.on('disconnect', id => console.log('Disconnect', id));
            mesh.on('error', (id, err) => console.log('Error', err));

            mesh.on('data', (id, data) => console.log(data.toString()));
            mesh.on('stream', (id, stream) => {
                console.log({stream, id});
                let vid = document.createElement('video');
                vid.setAttribute('autoplay', '');
                vid.setAttribute('controls', '');
                vid.volume = 0;
                document.body.appendChild(vid);
                setTimeout(() => {
                    vid.srcObject = stream;
                }, 100);
            });
            mesh.on('track', (id, track) => console.log({track}));

            mesh.broadcast("HELLO");

            console.log(mesh);
        },
        methods: {}
    };
</script>

<style>
    #app {
        font-family: "Avenir", Helvetica, Arial, sans-serif;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        text-align: center;
        color: #2c3e50;
    }

    video{
        max-width:600px;
    }

    #outgoing {
        width: 600px;
        word-wrap: break-word;
        white-space: normal;
    }
</style>
