require('dotenv').config();
const express = require('express');
const request = require('request');
const rp = require('request-promise-native');
const cheerio = require('cheerio'); 

const app = express();

/**
// CORS support
// Needed to be above the app.get definitions
//
**/

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*"); // update to match the domain you will make the request from
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

app.use(
  express.urlencoded({
    extended: true
  })
)

app.use(express.json())

const isEmptyObject = (obj) => {
  return !Object.keys(obj).length;
}

/**
// Fetch requests
// All requests made to the Steam Web API or to the Steam community profile pages
//
**/


/**
// This function attempts to retrieve a player's Steam64 id via the Steam Web API.
//
// It takes a player's vanity username (a String containing alphanumeric characters) as its only input. 
// It returns an object containing the Steam64 id associated with the player's account.
//
// In any case where player data cannot be retrieved (e.g. server error or non-existent username),
// an error message is logged on the server and an empty object is returned to the calling function.
**/
const fetchUserId = async (userName) => {
	let options = {
		uri: 'https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/',
		qs: {
			key: process.env.STEAM_API_KEY,
			vanityurl: userName
			
		},
		headers: {
			'User-Agent': 'Request-Promise'
		},
		json: true
	};
	
	try {
		const profileId = await rp(options);
		return profileId.response;
	} catch (err) {
		console.log(`Error retrieving profile id from Steam API for vanity username=${userName}`);
		return {};
	}
}

/**
// This function attempts to retrieve a player's profile data via the Steam Web API.
//
// It takes a player's Steam64 id as its only input. 
// It returns an object containing the profile data associated with the player's account.
//
// In any case where player data cannot be retrieved (e.g. server error or permissions error), 
// an error message is logged on the server and returned to the calling function and/or front-end.
**/
const fetchUserProfile = async (profileId) => {
	let options = {
		uri: 'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/',
		qs: {
			key: process.env.STEAM_API_KEY,
			steamids: profileId
			
		},
		headers: {
			'User-Agent': 'Request-Promise'
		},
		json: true
	};
	
	try {
		const profileData = await rp(options);
		
		if (!profileData || !profileData.response || profileData.response.players.length === 0) {
			console.log(`No profile data returned from Steam API for profileId=${profileId}`);
			return {error: `User with Steam64 id of ${profileId} cannot be found!`};
		} else {
			return profileData.response.players[0];
		}
	} catch (err) {
		console.log(`Error retrieving profile data from Steam API for profileId=${profileId}`);
		return {error: `User with Steam64 id of ${profileId} cannot be found!`};
	}
}

/**
// This function attempts to retrieve a player's friends list data via the Steam Web API.
//
// It takes a player's Steam64 id as its only input. 
// It returns an array containing an object with profile data for 5 of the player's friends. 
// See the description for processFriendsData for more info as to why the array is length 5.
//
// In any case where player data cannot be retrieved (e.g. server error or permissions issue), 
// an error message is logged on the server and an empty array is returned to the front-end.
**/
const fetchFriendsList = async (profileId) => {
	let options = {
		uri: 'https://api.steampowered.com/ISteamUser/GetFriendList/v0001/',
		qs: {
			key: process.env.STEAM_API_KEY,
			relationship: 'friend',
			steamid: profileId
			
		},
		headers: {
			'User-Agent': 'Request-Promise'
		},
		json: true
	};
	
	try {
		let rawFriendsData = await rp(options);
		return processFriendsData(rawFriendsData, profileId);
	} catch (err) {
		if (err.statusCode === 401) {
			console.log(`Friends list for profileId=${profileId} is set to private`);
		} else {
			console.log(`Error retrieving friend data from Steam API for profileId=${profileId}`);
		}
		return [];
	}
}

/**
// This function attempts to retrieve a player's list of recently played games data.
// It does so by scraping the player's community profile page.
//
// It takes a player's Steam community profile URL and their Steam64 id as its input. 
// It returns an array containing an object with game and achievement data for 10 of their most recently played games. 
//
// In any case where player data cannot be retrieved (e.g. server error or permissions issue),
// an error message is logged on the server and an empty array is returned to the front-end.
**/
const fetchGames = async (profileUrl, profileId) => {
	let options = {
		uri: profileUrl + '/games/',
		qs: {
			tab: 'all',
		},
		headers: {
			'User-Agent': 'Request-Promise'
		},
		json: false
	};
	
	try {
		const rawGamesData = await rp(options);
		
		const $ = cheerio.load(rawGamesData);
		
		//for all script tags on the page, find the one containing "rgGames"
		const targetedNode = $('body script').map((i, x) => x.children[0])
                                 .filter((i, x) => x && x.data.match(/rgGames/)).get(0);
		

		//find 'var rgGames =" in the text and split on it, so the games data is in the second token (i.e. matchX[1])
		const matchX = targetedNode.data.match(/var rgGames = (.*);/);
		
		//take the games data and parse it as JSON, sort on last_played, and take the first 10 entries
		const gamesJSON = JSON.parse(matchX[1]).sort((a, b) => b.last_played - a.last_played).slice(0,10);

		return await processGamesData(gamesJSON, profileId);
	} catch (err) {
		if (err.statusCode === 401) {
			console.log(`Games list for profileId=${profileId} is set to private`);
		} else {
			console.log(`Error retrieving games data by scraping Steam for profileId=${profileId}`);
			console.log(err);
		}
		return [];
	}
}

/**
// This function attempts to retrieve a player's achievement data for a singular game via the Steam Web API.
//
// It takes a game's Steam application id and the player's Steam64 id as its input. 
// It returns an array containing a player's achievement data for a specific game.
// 
// This function makes 2 calls to the Steam Web API due to how the system is designed.
// One call is made to retrieve the player's achievement status for this game, i.e. which achievements they have unlocked and when.
// The second call is made to retrieve general achievement info for this game, i.e. the name of each achievement, the achievement display icon, etc.
// The two result sets are merged together to provide the front-end with ample information for display purposes.
//
// In any case where player data cannot be retrieved (e.g. server error or permissions issue),
// an error message is logged on the server and an empty array is returned to the calling function.
**/

const fetchUnlockedAchievements = async (gameId, profileId) => {
	let userAchieveOptions = {
		uri: 'https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/',
		qs: {
			key: process.env.STEAM_API_KEY,
			appid: gameId,
			steamid: profileId
			
		},
		headers: {
			'User-Agent': 'Request-Promise'
		},
		json: true
	};
	
	let gameAchieveOptions = {
		uri: 'https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/',
		qs: {
			key: process.env.STEAM_API_KEY,
			appid: gameId			
		},
		headers: {
			'User-Agent': 'Request-Promise'
		},
		json: true
	};

	try {
		const achieveData = await Promise.all([rp(userAchieveOptions), rp(gameAchieveOptions)]);
		let achieves = achieveData[0].playerstats.achievements.map((item, i) => Object.assign({}, item, achieveData[1].game.availableGameStats.achievements[i]));
		return achieves.sort((a, b) => b.unlocktime - a.unlocktime).slice(0, 6);
	} catch (err) {
		console.log(`Error retrieving achievement data from Steam API for gameId=${gameId}`);
		return [];
	}
}

/**
// Support functions
// All of these functions are used to handle / manipulate retrieved data from Steam
// into a format that the front-end can use.
//
**/


/**
// This function takes a player's friend list data as an input and attempts to populate each of those friends
// with their profile data, so the front-end has more information to work with.
//
// It takes an array of friends list data and the player's Steam64 as its input. 
// It returns an array containing an object populated with profile data for the player's friends.
//
// The response array is limited to a size of 5 as the front-end is designed to only work with 5 friends as of this time,
// and there's no point in doing extra computation if it isn't needed. The 5 friends selected are determined by Steam, and
// as of now, are sorted in the order of oldest registration date to latest.
//
// In any case where player data cannot be retrieved (e.g. server error or permissions issue), an error message is logged on the server and
// an empty array is returned to the front-end.
**/
const processFriendsData = async (rawFriendData, profileId) => {
	if (rawFriendData != null && isEmptyObject(rawFriendData)) {
		//Use cases: a) private friend list or b) no friends
		console.log(`Friends list for profileId=${profileId} is set to private or they don't own any games`);
		return [];
	} else if (rawFriendData != null && rawFriendData.friendslist != null && rawFriendData.friendslist.friends != null && rawFriendData.friendslist.friends.length > 0) {
		//Use case: one or more public friends
		const getProfileDetailsForAllFriends = (list) => {
			return Promise.all(
				list.map(({steamid, relationship, friend_since}) => fetchUserProfile(steamid))
			)
		};
		
		//slice top 5 for now
		return await getProfileDetailsForAllFriends(rawFriendData.friendslist.friends.slice(0, 5));
	} else {
		//generic error case
		return [];
	}
}

/**
// This function takes a player's game list data as an input and attempts to retrieve all relevant achievement
// data for that game. 
//
// It takes an array of games data and the player's Steam64 as its input. 
// It returns an array containing an object for each of the recently played games, and that object
// contains an array of all of the player's achievement data for that game.
//
// In any case where player data cannot be retrieved (e.g. server error or permissions issue), an error message is logged on the server and
// an empty array is returned to the front-end.
**/

const processGamesData = async (rawGameData, profileId) => {
	if (rawGameData != null && isEmptyObject(rawGameData)) {
		//Use cases: a) private games list or b) no games
		console.log(`Games list for profileId=${profileId} is set to private or they don't own any games`);
		return [];
	} else if (rawGameData != null && rawGameData.length > 0) {
		//Use case: one or more public games
		
		const getAchievementsForAllGames = (list) => {
			return Promise.all(
				list.map(async (game) => {
					const achieves = await fetchUnlockedAchievements(game.appid, profileId);
					return {name: game.name, appId: game.appid, logo: game.logo, achievements: achieves};
				})
			)
		}
				
		return await getAchievementsForAllGames(rawGameData);
	} else {
		//generic error case
		console.log(`Generic error encountered processing games list for profileId=${profileId}`);
		return [];
	}
}

/**
// Request handlers
// These are the paths the front-end (or anyone) can use to access this server.
// 
**/


/**
// This handler is used to retrieve a player's profile data, their friends list (with accompanying user data),
// and their games list (with achievement data). 
//
// It takes a Steam64 id as its only input. 
// It returns an object containing all 3 sets of data, with the player data encapsulated within its own object,
// and the friends and games data encapsulated within a couple of arrays.
//
// In any error case where player data cannot be retrieved, an error message is returned to the front-end.
// If friend and/or games data cannot be retrieved (perhaps due to restrictive user permissions), an 
// empty array is returned to the front-end and data is logged to the console.
**/
app.get('/steam/user/:userid/profile', async function(httpRequest, httpResponse) {
	//userId can be either a Steam64 id or a vanity URL
	let userId = httpRequest.params.userid;
	
	//remove any non-alphanumeric characters and underscores
	userId = userId.replace(/[\W_]+/g,'');
	
	let response = {};
	
	//use type coercion to parse the _entirety_ of the string (`parseFloat` alone does not do this) and ensure strings of whitespace fail
	if (!isNaN(userId) && !isNaN(parseFloat(userId))) {
	
		const friends = fetchFriendsList(userId);
		
		//await the profile call because the game call leverages data from the response
		const player = await fetchUserProfile(userId);
		
		if (!player.error) {
			const games = fetchGames(player.profileurl, userId);
			
			const result = await Promise.all([player, friends, games]);
			
			response = {player: result[0], friends: result[1], games: result[2]};
		} else {
			//if user profile could not be found
			response = player;
		}
	} else {
		//if id is invalid but made it through front-end check
		response = {'error': 'An invalid id value was provided to the server. Please either provide a Steam64 id or vanity username.'};
	}
	
	httpResponse.setHeader('Content-Type', 'application/json');
	httpResponse.send(response);
});

/**
// This handler is used to convert a user's vanity username (e.g. "sampleName" in https://steamcommunity.com/id/sampleName)
// into the hidden Steam64 64-bit id number.
//
// It takes a vanity username (alphanumeric, no underscores) as its only input. 
// It returns an object containing a success code and the Steam64 id, if the request was successful.
// and the friends and games data encapsulated within a couple of arrays.
//
// If an error occurs or if the username cannot be resolved, a generic error message is returned
// indicating that the profile cannot be found using that Steam64 id or vanity username.
**/
app.get('/steam/user/:userid/vanityurl', async function(httpRequest, httpResponse) {
	//userId can be either a Steam64 id or a vanity URL
	let userId = httpRequest.params.userid;
	
	//remove any non-alphanumeric characters and underscores
	userId = userId.replace(/[\W_]+/g,'');
	
	let response = {};
	
	//if userId is a vanity url, it needs to be resolved to a Steam64 id
	//use type coercion to parse the _entirety_ of the string (`parseFloat` alone does not do this) and ensure strings of whitespace fail
	if (isNaN(userId) || isNaN(parseFloat(userId))) {
		//is a vanity url, retrieve userId
		const profileIdResponse = await fetchUserId(userId);
		if (profileIdResponse && profileIdResponse.success === 1) {
			response = {steamId: profileIdResponse.steamid};
		} else {
			response = {'error': 'We\'re sorry, we are unable to find your user profile. Please ensure your Steam64 id or vanity username are entered correctly.'};
		}
	}
	
	httpResponse.setHeader('Content-Type', 'application/json');
	httpResponse.send(response);
});

app.use('/', express.static('public'));

var port = process.env.HOST_PORT ? process.env.HOST_PORT : 4000;
var server = app.listen(port);
console.log('Listening on port ' + port);