require('dotenv').config()
var https = require('https');
var request = require('request');
var http = require("http");
var roomId    = process.env.ROOM_ID || config.ROOM_ID;
var token     = process.env.TOKEN || config.TOKEN;
var emptyMessage = " \n";
var susiUsername="";

// To bind a port on heroku
https.createServer(function (request, response) {
    console.log("listening on port "+(process.env.PORT || 8080));
}).listen(process.env.PORT || 8080);
// ping heroku every 10 minutes to prevent it from sleeping
setInterval(function() {
    http.get(process.env.HEROKU_URL);
}, 600000); // every 10 minutes

const timezoneOffset = (new Date()).getTimezoneOffset();
const defaultAnswer = {
    data: [{
        "0": "",
        timezoneOffset,
        language: "en"
    }],
    metadata: {
        count: 1
    },
    actions: [{
        type: "answer",
        expression: "Hmm... I\'m not sure if i understand you correctly."
    }],
    skills: ["/en_0090_fail.json"],
    persona: {}
};
// Setting the options variable to use it in the https request block
var options = {
    hostname: 'stream.gitter.im',
    port:     443,
    path:     '/v1/rooms/' + roomId + '/chatMessages',
    method:   'GET',
    headers:  {'Authorization': 'Bearer ' + token}
};
//make api call to get user name
var gitterOptionsUsername = {
    method: 'GET',
    url: "https://api.gitter.im/v1/user",
    headers:
    {
        'authorization': 'Bearer '+ token ,
        'content-type': 'application/json',
        'accept': 'application/json'
    },
    json: true
};
// making the request to Gitter API
request(gitterOptionsUsername, function (error, response, body) {
    if(error)
    throw new Error(error);
    susiUsername=body[0].username;
});
// making a request to gitter stream API
var req = https.request(options, function(res) {
    res.on('data', function(chunk) {
        var msg = chunk.toString();
        if(msg != emptyMessage){
            var jsonMsg = JSON.parse(msg);
            if(jsonMsg.text.startsWith("@"+susiUsername) && jsonMsg.fromUser.displayName !== susiUsername){
                // The message sent to Susi AI gitter room by the client.
                var clientMsg = jsonMsg.text.slice(susiUsername.length+1);
                var ans = '';

                // To set options for a request to Susi with the client message as a query
                var susiOptions = {
                    method: 'GET',
                    url: 'http://api.susi.ai/susi/chat.json',
                    qs: {  q: clientMsg }
                };

                // A request to the Susi AI API
                request(susiOptions, function (error1, response1, body1) {
                    if (error1)
                    throw new Error(error1);

                    var data = JSON.parse(body1);
                    //handle default case of no answer
                    if(!data.answers.length || data.answers.length===0){
                        data.answers.push(defaultAnswer);
                    }
                    var answerActions = data.answers[0].actions;
                    answerActions.forEach(function(action) {
                        var type=action.type;
                        // fetching the answer from Susi's response
                        if(type === "rss"){
                            ans += "I found this on the web-:\n\n";
                            var maxCount=5;
                            let rssData = JSON.parse(body1).answers[0].data;
                            let columns = type[1];
                            let key = Object.keys(columns);

                            rssData.forEach(function(row,index) {
                                if(row<maxCount){
                                  ans += ('Title : ');
                                  ans += row.title+", ";
                                  ans += ('Link : ');
                                  ans += row.link+", ";
                                  ans += '\n\n';
                                }
                              });
                        }
                        else if(type === "table"){
                            var tableData = (JSON.parse(body1)).answers[0].data;
                            var columnsObj=action.columns;
                            var maxRows=100;
                            let columns = Object.keys(columnsObj);
                            var columnsData = Object.values(columnsObj);
                            tableData.forEach(function(row,index) {
                                if(row[columns[0]] && index<maxRows){
                                    let msg = "*"+row[columns[0]]+"*" + ", " + row[columns[1]] + "\n" + row[columns[2]]+ "\n ";
                                    ans=ans+msg;
                                }
                            });
                            ans += '\n\n';
                        }
                        else
                        {
                            ans = action.expression;
                        }
                    });

                    // To set options to send a message i.e. the reply by Susi AI to client's message, to Gitter
                    var gitterOptions = {
                        method: 'POST',
                        url: 'https://api.gitter.im/v1/rooms/'+roomId+'/chatMessages',
                        headers:
                        {
                            'authorization': 'Bearer '+ token ,
                            'content-type': 'application/json',
                            'accept': 'application/json'
                        },
                        body:
                        {
                            text: ans
                        },
                        json: true
                    };

                    // making the request to Gitter API
                    request(gitterOptions, function (error, response, body) {
                        if(error)
                        throw new Error(error);
                        console.log(body);
                    });
                });
            }
        }
    });
});

req.on('error', function(e) {
    console.log('Hey something went wrong: ' + e.message);
});

req.end();
