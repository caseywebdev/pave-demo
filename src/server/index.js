const _ = require('underscore');
const {Store, Router} = require('pave');
const express = require('express');
const LiveSocket = require('live-socket');
const OrgSyncApi = require('orgsync-api');
const ws = require('ws');

const api = new OrgSyncApi();

const sockets = {};

const authenticatedSockets = () => _.filter(sockets, 'userId');

const getUsers = () =>
  _.chain(authenticatedSockets())
    .map('userId')
    .unique()
    .map(userId => ({$ref: ['usersById', userId]}))
    .value();

const broadcast = (event, message) =>
  _.invoke(authenticatedSockets(), 'send', event, message);

const AUTH_FAILED = new Error('Authentication Failed');
const AUTH_REQUIRED = new Error('Authentication Required');

const router = new Router({
  routes: {
    users: () => ({users: {$set: getUsers()}}),

    'auth!.$key':
    ({1: key, store: {cache: {socket}}}) =>
      api.get('/keys/me', {key}).then(({data: {target: {id}}}) => {
        if (socket.key) return;

        const exists = _.any(sockets, {userId: id});
        socket.key = key;
        socket.userId = id;

        const delta = {users: {$set: getUsers()}};
        if (!exists) {
          delta.messages = {
            $push: {
              from: {$ref: ['usersById', id]},
              at: new Date(),
              system: true,
              content: 'joined the chat.'
            }
          };
        }

        broadcast('pave', delta);

        return {key: {$set: key}, userId: {$set: id}};
      }),

    'signIn!.$obj':
    ({1: {username, password}, store}) =>
      api.post('/authentication/login', {
        username,
        password,
        community_id: 2,
        device_info: 'Pave Demo'
      }).then(
        ({data: {key}}) => store.run({query: ['auth!', key]}),
        () => { throw AUTH_FAILED; }
      ),

    'usersById.$keys.$keys':
    ({1: ids, 2: fields, store: {cache: {socket: {key}}}}) => {
      if (!key) throw AUTH_REQUIRED;

      return Promise.all(_.map(ids, id =>
        api.get('/accounts/:id', {key, id}).then(({data: user}) =>
          ({
            usersById: {
              [id]: {
                $merge: fields.reduce((attrs, field) => {
                  attrs[field] = user[field];
                  if (attrs[field] === undefined) attrs[field] = null;
                  return attrs;
                }, {})
              }
            }
          })
        ).catch(er => ({usersById: {[id]: {$set: {$error: er.message}}}}))
      ));
    },

    'createMessage!.$obj':
    ({1: {content}, store: {cache: {socket: {userId}}}}) => {
      if (!userId) throw AUTH_REQUIRED;

      broadcast('pave', {
        messages: {
          $push: {
            from: {$ref: ['usersById', userId]},
            at: new Date(),
            content
          }
        }
      });
    }
  }
});

const LISTENERS = {
  open: ({socket}) =>
    sockets[socket.id = _.uniqueId()] = socket,

  pave: ({socket, params: {query}}) =>
    (new Store({cache: {socket}, router})).run({query}),

  close: ({socket}) => {
    const {userId} = socket;
    delete sockets[socket.id];
    if (userId && !_.any(sockets, {userId})) {
      broadcast('pave', {
        messages: {
          $push: {
            from: {$ref: ['usersById', socket.userId]},
            at: new Date(),
            system: true,
            content: 'left the chat.'
          }
        },
        users: {$set: getUsers()}
      });
    }
  }
};

const app = express().get('*', express.static('public'));
const server = app.listen(process.env.PORT);
const wss = new ws.Server({server});
wss.on('connection', socket => {
  socket = new LiveSocket({socket});
  _.each(LISTENERS, (cb, name) =>
    socket.on(name, (params, done) =>
      Promise
        .resolve({socket, params})
        .then(cb)
        .then(_.partial(done, null), done)
    )
  );
  socket.trigger('open');
});
