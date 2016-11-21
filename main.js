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
var connected = false;
var failCount = 0;

process.on('SIGINT', function () {
    if (adapter && adapter.setState) {
        adapter.setState("info.connection", false, true);
    }
    if (nextPoll)  {
        clearTimeout(nextPoll);
    }
});

adapter.on('unload', function (callback) {
    try {
        adapter.log.info('cleaned everything up...');
        callback();
    } catch (e) {
        callback();
    }
});

adapter.on('message', function (obj) {
    if (obj && obj.command == 'listModels') {
            var models = Object.keys(Models)
            adapter.log.info("Listing models");
            if (obj.callback) adapter.sendTo(obj.from, obj.command, models, obj.callback);
    }
});

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
    initObjects();
    adapter.log.info("Port opened, starting polling...");
    poll();
  }
}

function initObjects() {
  // create connected object and state
  adapter.getObject('info.connection', function (err, obj) {
       if (!obj || !obj.common || obj.common.type !== 'boolean') {
          obj = {
              _id:  'info.connection',
              type: 'state',
              common: {
                  role:  'indicator.connected',
                  name:  'If connected to eastron device',
                  type:  'boolean',
                  read:  true,
                  write: false,
                  def:   false
              },
              native: {}
          };
          adapter.setObject('info.connection', obj, function () {
              adapter.setState('info.connection', connected, true);
          });
       }
  });

  model.forEach(function(register) {
     adapter.getObject(register.label, function (err, object) {
       if (!object) {
         var obj = {
          _id: register.label,
          type: 'state',
          common: {
            name: register.label,
            unit: register.um,
            type: 'number',
            role: 'variable'
          },
          native: register
        };
        adapter.setObject(obj._id, obj, function (err) {  });
       }
     });
  })
}

function main() {

}

function setConnected(newState) {
  if(connected != newState) {
    if(!newState) {
      if(++failCount > 5) {
        connected = false;
      }
    } else {
      connected = newState;
    }
    adapter.setState('info.connection', connected, true);
  }
}

function poll () {
    adapter.log.debug("Polling")
    async.eachSeries(model, function(register, cb) {
      client.readInputRegisters(register.reg, 2).then(result => {
        setConnected(true);
        adapter.log.debug("Response received");
        var value = result.buffer.readFloatBE().toFixed(1);
        if(adapter.config.positive)
          value = Math.abs(value);

        adapter.setState(register.label, {val: value, ack: true});
        cb();
      }).catch(error => cb(error))
    }, function(err) { if(err) {
      adapter.log.warn("Polling error " + err);
      setConnected(false); 
    }})
    nextPoll = setTimeout(poll, 5000);
}

