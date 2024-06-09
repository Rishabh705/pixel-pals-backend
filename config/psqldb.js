const Pool = require('pg').Pool
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.PSQL_URI,
})

console.log(pool);
module.exports = pool   