/**
 *
 * eastron adapter
 *
 *
 *  file io-package.json comments:
 *
 *  {
 *      "common": {
 *          "name":         "eastron",                  // name has to be set and has to be equal to adapters folder name and main file name excluding extension
 *          "version":      "0.0.0",                    // use "Semantic Versioning"! see http://semver.org/
 *          "title":        "Node.js eastron Adapter",  // Adapter title shown in User Interfaces
 *          "authors":  [                               // Array of authord
 *              "name <mail@eastron.com>"
 *          ]
 *          "desc":         "eastron adapter",          // Adapter description shown in User Interfaces. Can be a language object {de:"...",ru:"..."} or a string
 *          "platform":     "Javascript/Node.js",       // possible values "javascript", "javascript/Node.js" - more coming
 *          "mode":         "daemon",                   // possible values "daemon", "schedule", "subscribe"
 *          "schedule":     "0 0 * * *"                 // cron-style schedule. Only needed if mode=schedule
 *          "loglevel":     "info"                      // Adapters Log Level
 *      },
 *      "native": {                                     // the native object is available via adapter.config in your adapters code - use it for configuration
 *          "test1": true,
 *          "test2": 42
 *      }
 *  }
 *
 */

/* jshint -W097 */// jshint strict:false
/*jslint node: true */
"use strict";

var async = require("async")
var utils =    require(__dirname + '/lib/utils'); // Get common adapter utils
var adapter = utils.adapter('eastron');
var ModbusRTU = require("modbus-serial");
var client = new ModbusRTU();
var Models = require('./models.json');
var model;
var nextPoll;

process.on('SIGINT', function () {
    if (adapter && adapter.setState) {
        adapter.setState("info.connection", false, true);
        adapter.setState("info.pdu",        "",    true);
        adapter.setState("info.poll_time",  "",    true);
    }
    if (nextPoll)  {
        clearTimeout(nextPoll);
    }
});

// is called when adapter shuts down - callback has to be called under any circumstances!
adapter.on('unload', function (callback) {
    try {
        adapter.log.info('cleaned everything up...');
        callback();
    } catch (e) {
        callback();
    }
});

// is called if a subscribed object changes
adapter.on('objectChange', function (id, obj) {
    // Warning, obj can be null if it was deleted
    adapter.log.info('objectChange ' + id + ' ' + JSON.stringify(obj));
});

// is called if a subscribed state changes
adapter.on('stateChange', function (id, state) {
    // Warning, state can be null if it was deleted
    adapter.log.info('stateChange ' + id + ' ' + JSON.stringify(state));

    // you can use the ack flag to detect if it is status (true) or command (false)
    if (state && !state.ack) {
        adapter.log.info('ack is not set!');
    }
});

adapter.on('message', function (obj) {
    if (obj && obj.command == 'listModels') {
            var models = Object.keys(Models)
            adapter.log.info("Listing models");
            if (obj.callback) adapter.sendTo(obj.from, obj.command, models, obj.callback);
    }
});

// is called when databases are connected and adapter received configuration.
// start here!
adapter.on('ready', function () {
    if(!adapter.config.model) {
      adapter.log.error("Select a device Model");
      return;
    }
    model = Models[adapter.config.model];
    client.setID(adapter.config.id);
    client.setTimeout(5000);
    adapter.log.info("Connecting to " + adapter.config.port)
    client.connectRTUBuffered(adapter.config.port, {baudrate: parseInt(adapter.config.baud)}, openResult);
});

function openResult(error) {
  if(error) {
    adapter.log.error(error);
  } else {
    adapter.log.info("Port opened, starting polling...");
    poll();
  }
}

adapter.on('unload', function () {

});

function main() {
    adapter.log.info('config test1: ' + adapter.config.test1);
    adapter.log.info('config test1: ' + adapter.config.test2);

    adapter.setObject('testVariable', {
        type: 'state',
        common: {
            name: 'testVariable',
            type: 'boolean',
            role: 'indicator'
        },
        native: {}
    });
    adapter.subscribeStates('*');
    adapter.setState('testVariable', true);
    adapter.setState('testVariable', {val: true, ack: true});
    adapter.setState('testVariable', {val: true, ack: true, expire: 30});
}

function publish(register, value) {
  var id = "";
  if(register.group)
   id = register.group + "."
  id += register.label;

var obj = {
            _id: id,
                type: 'state',
                common: {
                    name: id,
                    unit: register.um,
                    type: 'number',
                    role: 'variable'
                },
                native: register
            };
  adapter.getObject(obj._id, function (err, object) {
            if (!object) { 
              adapter.setObject(obj._id, obj, function (err) {  });
            } 
  });
}

function poll () {
    adapter.log.debug("Polling")
    async.eachSeries(model, function(register, cb) {
      client.readInputRegisters(register.reg, 2).then(result => {
        adapter.log.debug("Response received");
        var value = result.buffer.readFloatBE().toFixed(1);
        publish(register);
        adapter.setState(register.label, {val: value, ack: true});
        cb();
      }).catch(error => cb(error))
    }, function(err) { if(err) adapter.log.error("Polling error " + err)  })
    nextPoll = setTimeout(poll, 5000);
}

