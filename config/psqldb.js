const Pool = require('pg').Pool
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.PSQL_LOCAL,
})

module.exports = pool   