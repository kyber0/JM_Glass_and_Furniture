let io;

module.exports = {
    init: (httpServer) => {
        const { Server } = require('socket.io');
        io = new Server(httpServer, { cors: { origin: '*' } });
        return io;
    },
    getIO: () => {
        if (!io) {
            console.warn('Socket.io is not initialized yet');
        }
        return io;
    }
};
