var _ = require('underscore');
var ObjectID = require('mongodb').ObjectID;
var request = require('request');

exports.action = {
  name: "accountsFetch",
  description: "Returns a list of accounts, or a specific one if id is defined. Method: GET",
  inputs: {
    required: [],
    optional: ['q', 'fields', 'sort', 'limit', 'skip', 'id'],
  },
  authenticated: false,
  outputExample: {},
  version: 1.0,
  run: function(api, connection, next) {
    var accountsCollection = api.mongo.collections.loggerAccounts;
    var selector, fields, sort, options = {};

    // If id is defined, override selector
    if (connection.params.id) {
      selector = { _id: new ObjectID(connection.params.id) };
    } else {
      // Otherwise try to parse selector parameter
      try {
        selector = JSON.parse(connection.params.q);
      } catch(err) {
        selector = {};
      }
    }
    
    // Try to parse fields parameter
    try {
      fields = JSON.parse(connection.params.fields);
    } catch(err) {
      fields = {};
    }
    
    // Try to parse sort parameter
    try {
      sort = JSON.parse(connection.params.sort);
    } catch(err) {
      sort = undefined;
    }

    // Options parameters. Ignore them if id is defined
    if (!connection.params.id) {
      options.limit = connection.params.limit;
      options.skip = connection.params.skip;
      options.sort = sort;
    }

    // Find accounts
    accountsCollection.find(selector, fields, options).toArray(function(err, docs) {
      if (!err) {
        connection.rawConnection.responseHttpCode = 200;
        connection.response = {
          success: true,
          data: docs
        };

        next(connection, true);
      } else {
        connection.rawConnection.responseHttpCode = 500;
        connection.error = err;
        connection.response = {
          success: false,
          message: err
        };

        next(connection, true);
      }
    });
  }
};

exports.accountsCreate = {
  name: "accountsCreate",
  description: "Creates a new account. Method: POST",
  inputs: {
    required: ['username', 'email'],
    optional: [],
  },
  authenticated: false,
  outputExample: {},
  version: 1.0,
  run: function(api, connection, next) {
    var accountsCollection = api.mongo.collections.loggerAccounts;
    var accountDoc = api.mongo.schema.new(api.mongo.schema.loggerAccount);
    accountDoc.name = connection.params.username;
    accountDoc.email = connection.params.email;

    var params = {
      id: 'cs-dev-' + accountDoc.name,
      name: accountDoc.name,
      plan: "free",
      user: {
        id: accountDoc.name,
        email: accountDoc.email
      }
    };

    var auth = {
      username: "cloudspokes",
      password: "239f45c2eu4d709m3c56684e827508d6"
    };

    // Create Papertrail account
    request.post({ url: "https://papertrailapp.com/api/v1/distributors/accounts", form: params, auth: auth }, function (err, response, body) {
      console.log(body);
      if (err) {
        connection.rawConnection.responseHttpCode = 500;
        connection.error = err;
        connection.response = {
          success: false,
          message: err
        };

        next(connection, true);
      } else {
        body = JSON.parse(body);
        if (!body.id || !body.api_token) {
          connection.rawConnection.responseHttpCode = 500;
          connection.error = body.message;
          connection.response = {
            success: false,
            message: "Could not create account in Papertrail (probably already exists)"
          };

          next(connection, true);
        } else {
          accountDoc.papertrailId = body.id;
          accountDoc.papertrailApiToken = body.api_token;
          
          // Insert document into the database
          accountsCollection.insert(accountDoc, { w:1 }, function(err, result) {
            if (!err) {
              connection.rawConnection.responseHttpCode = 201;
              connection.response = {
                success: true,
                message: "Account created successfully",
                data: result
              };

              next(connection, true);
            } else {
              connection.rawConnection.responseHttpCode = 500;
              connection.error = err;
              connection.response = {
                success: false,
                message: err
              };

              next(connection, true);
            }
          });
        }
      }
    });
  }
};
