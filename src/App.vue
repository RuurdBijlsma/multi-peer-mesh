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
            mesh.printDebug = false;
            await mesh.connect("http://localhost:5858");
            await mesh.join('default');

            mesh.on('connect', id => console.log("Connect", id));
            mesh.on('disconnect', id => console.log("Disconnect", id));
            mesh.on('error', e => console.log("Error", e));

            mesh.on('data', data => console.log(data.toString()));
            mesh.on('stream', stream => console.log({stream}));
            mesh.on('track', track => console.log({track}));

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

    #outgoing {
        width: 600px;
        word-wrap: break-word;
        white-space: normal;
    }
</style>
