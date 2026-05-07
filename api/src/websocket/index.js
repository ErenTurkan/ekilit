const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const logger = require('../config/logger');

let io = null;

function initializeWebSocket(server) {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // Authentication middleware for socket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      const type = socket.handshake.auth?.type || socket.handshake.query?.type || 'admin';

      if (!token) {
        return next(new Error('Token gerekli'));
      }

      if (type === 'board') {
        // Board connection
        const { BoardToken, Board } = require('../models');
        const tokenRecord = await BoardToken.findOne({
          where: { token },
          include: [{ model: Board, as: 'board' }]
        });

        if (!tokenRecord || !tokenRecord.board) {
          return next(new Error('Geçersiz board token'));
        }

        socket.boardId = tokenRecord.board.id;
        socket.schoolId = tokenRecord.board.school_id;
        socket.connectionType = 'board';
        socket.boardCode = tokenRecord.board.board_code;
      } else {
        // Admin/user connection
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const { User } = require('../models');
        const user = await User.findByPk(decoded.userId);

        if (!user || !user.is_active) {
          return next(new Error('Geçersiz kullanıcı'));
        }

        socket.userId = user.id;
        socket.userRole = user.role;
        socket.schoolId = user.school_id;
        socket.connectionType = 'admin';
      }

      next();
    } catch (error) {
      logger.error('WebSocket auth error:', error.message);
      next(new Error('Kimlik doğrulama hatası'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`WebSocket connected: ${socket.connectionType} (${socket.id})`);

    // Join rooms based on type
    if (socket.connectionType === 'board') {
      socket.join(`board_${socket.boardId}`);
      socket.join(`school_${socket.schoolId}`);
      logger.info(`Board ${socket.boardCode} joined rooms`);

      // Handle board heartbeat via WebSocket
      socket.on('board:heartbeat', async (data) => {
        try {
          const { Board } = require('../models');
          await Board.update(
            {
              last_heartbeat: new Date(),
              status: data.status || 'locked',
              ip_address: socket.handshake.address
            },
            { where: { id: socket.boardId } }
          );

          // Broadcast to school admins
          socket.to(`school_${socket.schoolId}`).emit('board:heartbeat', {
            board_id: socket.boardId,
            status: data.status,
            last_heartbeat: new Date()
          });
        } catch (error) {
          logger.error('WebSocket heartbeat error:', error);
        }
      });

      // Handle screenshot upload via WebSocket (base64 - for small images)
      socket.on('board:screenshot', async (data) => {
        try {
          // Broadcast to school admins for live view
          socket.to(`school_${socket.schoolId}`).emit('board:screenshot', {
            board_id: socket.boardId,
            screenshot_data: data.screenshot_data,
            captured_at: new Date()
          });
        } catch (error) {
          logger.error('WebSocket screenshot error:', error);
        }
      });

      // Board acknowledging file received
      socket.on('board:file-received', async (data) => {
        try {
          const { File } = require('../models');
          await File.update(
            { status: 'completed' },
            { where: { id: data.file_id } }
          );

          socket.to(`school_${socket.schoolId}`).emit('file:status-update', {
            file_id: data.file_id,
            board_id: socket.boardId,
            status: 'completed'
          });
        } catch (error) {
          logger.error('File received error:', error);
        }
      });

    } else if (socket.connectionType === 'admin') {
      // Admin joins their school room
      if (socket.userRole === 'superadmin') {
        // Superadmin joins all school rooms — listen to everything
        socket.join('superadmin');
      } else {
        socket.join(`school_${socket.schoolId}`);
      }

      // Admin requesting board unlock
      socket.on('admin:unlock-board', async (data) => {
        io.to(`board_${data.board_id}`).emit('board:unlock', {
          method: 'remote',
          user: data.user_name
        });
      });

      // Admin requesting board lock
      socket.on('admin:lock-board', async (data) => {
        io.to(`board_${data.board_id}`).emit('board:lock', {});
      });
    }

    socket.on('disconnect', (reason) => {
      logger.info(`WebSocket disconnected: ${socket.connectionType} (${socket.id}) - ${reason}`);

      // If board disconnected, mark as offline after a delay
      if (socket.connectionType === 'board') {
        setTimeout(async () => {
          try {
            const { Board } = require('../models');
            const board = await Board.findByPk(socket.boardId);
            if (board) {
              const timeSinceHeartbeat = Date.now() - new Date(board.last_heartbeat).getTime();
              if (timeSinceHeartbeat > 60000) { // 1 minute
                await board.update({ status: 'offline' });
                io.to(`school_${socket.schoolId}`).emit('board:status-change', {
                  board_id: socket.boardId,
                  status: 'offline',
                  timestamp: new Date()
                });
              }
            }
          } catch (error) {
            logger.error('Board offline update error:', error);
          }
        }, 30000); // Check after 30 seconds
      }
    });

    socket.on('error', (error) => {
      logger.error(`WebSocket error: ${socket.id}`, error);
    });
  });

  logger.info('✅ WebSocket sunucusu başlatıldı');
  return io;
}

function getIO() {
  return io;
}

module.exports = { initializeWebSocket, getIO };
