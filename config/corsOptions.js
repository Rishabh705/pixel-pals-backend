//list that cors won't prevent from accessing our server
const whitelist = process.env.CORS_WHITELIST ? process.env.CORS_WHITELIST.split(',') : [];
const corsOptions = {
    origin:(origin, callback) =>{
        //if domain is in whitelist then let it pass
        if(whitelist.indexOf(origin) != -1 || !origin ){
            callback(null,true)
        }
        else{
            callback(new Error("Not allowed by cors"))
        }
    },
    credentials:true,
    optionsSuccessStatus:200
}

module.exports = corsOptions