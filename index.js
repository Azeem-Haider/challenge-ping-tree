const name = require('./package.json').name
require('productionize')(name)

const server = require('./lib/server')
const port = process.env.PORT || 5000
server().listen(port)
console.log(name, 'listening on port', port)
