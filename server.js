const express = require('express')
const cors = require('cors')
const {Server} = require('socket.io')
const path = require('path')
const { logger } = require('./middleware/logEvents')
const mongoose = require('mongoose')
const connectDB = require('./config/dbConn')
const corsOptions = require('./config/corsOptions')
const PORT = process.env.PORT || 3500
const verifyJWT = require('./middleware/verifyJWT')
const cookieParser = require('cookie-parser')

const app = express()

//connect to mongo
connectDB()
  
//don't listen if mongo connection fails
mongoose.connection.once('open', () => {
    console.log('Connected to MongoDB and ready to listen');
    const expressServer = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

    const io = new Server(expressServer, {
        cors: {
            origin: process.env.CORS_WHITELIST ? process.env.CORS_WHITELIST.split(',') : [] 
        },
     });
 
    io.on('connection', (socket) => {
        console.log(`User ${socket.id} connected`);

        //message came from client
        socket.on('send-message', (data) => {
            console.log(data);
            //add it to database and send it to reciever          
            socket.broadcast.emit('receive-message', data);
        });

        socket.on('disconnect', () => {
            console.log(`User ${socket.id} disconnected`);
        });
    });
});

//custom middlewares
app.use(logger)

//thirdparty middlewares
app.use(cors(corsOptions))

//built in middlewares
app.use(express.json())
app.use(express.urlencoded({extended:true}))
app.use(cookieParser())

//make all static files available
app.use(express.static(path.join('./public/'))) 

//routes
app.use('/',require('./routes/root'))
app.use('/api/auth',require('./routes/api/auth'))
app.use('/refresh', require('./routes/refresh'))

app.use(verifyJWT)
app.use('/api/chats',require('./routes/api/chats'))
app.use('/api/contacts',require('./routes/api/contacts'))

//Error page
app.get('/*', (req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'views', '404.html'))
})
