
# Steam Achievement Server

Steam Achievement Server is a standalone server environment built using [Node.js](https://nodejs.org/en/) and [Express.js](https://expressjs.com/). It exposes a few APIs which can be leveraged to query player-specific data made available by the Steam Web API and Steam community pages.

As this project was primarily intended as a learning experience with Node.js and Express.js, it's not ready to be used in any sort of commercial capacity. The project was developed with the idea of both front-end and back-end both being hosted on localhost. Only a core subset of APIs was implemented.

For a partner application to be used with this server, see [Steam Achievement Tracker](https://github.com/dave-bugeja/achieve-tracker).

## Installation

Use the node package manager [npm](https://www.npmjs.com/) to install Steam Achievement Server.

```bash
cd path\to\dir\achieve-server
npm install 
```

## Usage

### Creating the .env file
In order to start the server, you will need to create an environment file (.env) in the root directory of the project. This file takes two parameters:

HOST_PORT = *port_number*

STEAM_API_KEY = *Steam_Web_API_key*

Failure to include a port number will result in the default value of 4000 being used. Failure to include a Steam API key will result in all requests to the Steam Achievement Server failing, due to an inability to contact the Steam Web API. For more information on Steam API keys, see [here](https://steamcommunity.com/dev).

### Starting the server
To start the server, run the following commands:

```bash
cd path\to\dir\achieve-server
npm start
```

### Accessing the API endpoints
Then, web requests can be made to the following API endpoints:

https://*hostname*/steam/user/*userid*/vanityurl

https://*hostname*/steam/user/*userid*/profile

where "userid" is either a user's vanity username (e.g. "sampleName" in https://steamcommunity.com/id/sampleName) or their Steam64 id.

For more information on the provided API endpoints, please view the [server.js file](https://github.com/dave-bugeja/achieve-server/blob/main/server.js).

## Contributing
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## License
[MIT](https://github.com/dave-bugeja/achieve-server/blob/main/LICENCE)