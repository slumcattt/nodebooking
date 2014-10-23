var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var mongoose = require('mongoose');
var cred = require('./credentials.js');
var client = require('twilio')(cred.accountSID, cred.authToken);

var routes = require('./routes/index');
//var users = require('./routes/users');

var app = express();

var http = require('http').Server(app);
var io = require('socket.io')(http);

// DB Setup
mongoose.connect('mongodb://localhost/bookings');
var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function callback () {
  // yay!
});

var bookingSchema = mongoose.Schema({
    teamName: String,
    pilotName: String,
    tacticalName: String,
    engineerName: String,
    contactNumber: String,
    bookingTime: Date,
    status: Number,
    contactEmail: String,
    deathReason: String
});

var Booking = mongoose.model('Booking', bookingSchema);

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hjs');

// uncomment after placing your favicon in /public
//app.use(favicon(__dirname + '/public/favicon.ico'));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

var apiRouter = express.Router();

apiRouter.route('/teams')
  .get(function(req, res) {
    Booking.find({}, 'teamName pilotName tacticalName engineerName bookingTime status deathReason', function(err, teams) {
      if (err) {
        res.send(err);
      }
      else {
        res.json(teams);
      }
    });
  });


app.use('/', routes);
app.use('/api', apiRouter);
//app.use('/users', users);



function callCrew(systemNumber, bookingNumber, crewNumber){
  client.makeCall({

      to: bookingNumber, // Any number Twilio can call
      from: systemNumber, // A number you bought from Twilio and can use for outbound communication
      url: 'http://twimlets.com/echo?Twiml=%3CResponse%3E%0A%20%20%20%20%3CSay%3EDialing%20crew%20now%2C%20standby%3C%2FSay%3E%0A%20%20%20%20%3CDial%3E' + crewNumber + '%3C%2FDial%3E%0A%3C%2FResponse%3E&' // A URL that produces an XML document (TwiML) which contains instructions for the call

  }, function(err, responseData) {

      //executed when the call has been initiated.
      if(err){
        console.log('Error!');
        console.log(err);
      }
      else {
        console.log(responseData.from); // outputs "+14506667788"
      }

  });
}

function formatTelephoneNumber(number){
  if(number.charAt(0)=='0'){
    return '+44' + number.substring(1, number.length);
  }
  else{
    return number;
  }
}

io.on('connection', function(socket){
  console.log('a user connected');
  socket.on('syncRequest', function(msg){
    // Grab all entries and send them
    console.log('syncRequest received');
    Booking.find('', function (err, data){
      if(err) console.log(err);
      else{
        socket.emit('syncResponce', data);
        console.log('sending syncResponce');
      }
    });
  });

  socket.on('removeTeam', function (team){
    if(team._id==''){
      console.log('error,no team');
      socket.emit('teamRemovedFail', 'Incorrect ID');
    }
    else{
      console.log('removing team:');
      console.log(team._id);
      Booking.findByIdAndRemove(team._id, function (err, team){
        if(err) console.log(err);
        else{
          socket.emit('teamRemovedSuccess', team);
          socket.broadcast.emit('teamRemoved', team);
          console.log('team removed:');
          console.log(team._id);
        }
      });
    }
  });

  socket.on('updateTeam', function (team){
    if(team._id==''){
      console.log('error,no team');
      socket.emit('teamUpdatedFail', 'No Team ID');
    }
    else{
      console.log('updating team:');
      console.log(team._id);
      Booking.findByIdAndUpdate(team._id, team.update, function (err, team){
        if(err){
          console.log(err);
          socket.emit('teamUpdatedFail', err);
        }
        else{
          socket.emit('teamUpdatedSuccess', team);
          socket.broadcast.emit('teamUpdated', team);
          console.log('team updated:');
          console.log(team._id);
        }
      });
    }
  });

  socket.on('addTeam', function (team){
    if(team!=''){
      console.log('adding team:');
      // console.log(team.teamName);
      //team = team + {bookingTime: Date(), status: 0, deathReason: ""};
      team['bookingTime'] = Date();
      team['status'] = 0;
      team['deathReason'] = "";
      console.log(team);
      if(team.teamName!='' && team.PilotName!='' && team.TacticalName!='' && team.EngineerName!='' && team.contactEmail!='' && team.contactEmail!=''){
        Booking.create(team, function (err, team){
          if(err) console.log(err);
          else{
            socket.emit('teamAddedSuccess', team);
            socket.broadcast.emit('teamAdded', team);
            console.log('team added:');
            console.log(team._id);
          }
        });
      }
      else {
        console.log('some feilds missing');
        socket.emit('teamAddedFail', 'Missing input');
      }
    }
  });

  socket.on('patchCall', function (team){
    if(team._id==''){
      console.log('error,no team');
      socket.emit('patchCallFailed', 'No Team ID');
    }
    else{
      console.log('patching team:');
      console.log(team._id);
      Booking.findById(team._id, function (err, team){
        if(err){
          console.log(err);
          socket.emit('patchCallFail', err);
        }
        else{
          socket.emit('patchCallSuccess', team);
          console.log('iniating patch for:');
          console.log(team._id);
          client.makeCall({

              to: '+447733223902', // Any number Twilio can call
              from: cred.systemNumber, // A number you bought from Twilio and can use for outbound communication
              url: 'http://twimlets.com/echo?Twiml=%3CResponse%3E%0A%20%20%20%20%3CGather%20timeout%3D%2210%22%20numDigits%3D%221%22%20action%3D%22http%3A%2F%2Ftwimlets.com%2Fecho%3FTwiml%3D%253CResponse%253E%250A%2520%2520%2520%2520%253CSay%253EDialing%2520crew%2520now%252C%2520standby%253C%252FSay%253E%250A%2520%2520%2520%2520%253CDial%253E'+encodeURIComponent(formatTelephoneNumber(team.contactNumber))+'%253C%252FDial%253E%250A%253C%252FResponse%253E%22%3E%0A%3CPause%20length%3D%222%22%2F%3E%20%20%20%20%20%20%20%20%3CSay%3ECall%20will%20be%20patched%20to%20crew%20if%20you%20press%20any%20key%3C%2FSay%3E%0A%20%20%20%20%3C%2FGather%3E%0A%3C%2FResponse%3E&'

          }, function(err, responseData) {

              //executed when the call has been initiated.
              if(err){
                console.log('Error!');
                console.log(err);
              }
              else {
                console.log('Call placed'); // outputs "+14506667788"
              }

          });
        }
      });
    }
  });
});

http.listen(2000, function(){
  console.log('listening on *:2000');
});

// catch 404 and forward to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function(err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});


module.exports = app;
