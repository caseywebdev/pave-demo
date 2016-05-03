import _ from 'underscore';
import {Store, Router, SyncPromise} from 'pave';
import LiveSocket from 'live-socket';
import PaveSubscription from 'pave-subscription';
import React, {Component} from 'react';
import ReactDOM from 'react-dom';

const live = new LiveSocket();

const store = new Store({
  batchDelay: 1,
  cache: {
    key: localStorage.getItem('key'),
    userId: null,
    messages: [],
    users: []
  },
  router: new Router({
    routes: {
      '*': ({query}) =>
        new SyncPromise((resolve, reject) => {
          const email = store.get(['email']);
          live.send('pave', {query, email}, (er, delta) => {
            if (er) return reject(er);

            resolve(delta);
          });
        })
    }
  })
});

store.watch(['key'], () => localStorage.setItem('key', store.get(['key'])));

live.on('pave', ::store.update);

class User extends Component {
  static queryFragment = ['display_name', 'picture_url'];

  render() {
    const {user} = this.props;
    if (!user) return null;

    const {display_name: name, picture_url: src} = user;
    return (
      <div className='user'>
        <img src={src} /> {name}
      </div>
    );
  }
}

class Message extends Component {
  static queryFragment = [
    'system',
    'content',
    ['from', User.queryFragment]
  ];

  render() {
    const {at, from, system, content} = this.props.message;
    if (!from) return null;

    return (
      <div className='message'>
        <div className='from'>
          <User user={from} />
          <div className='at'>{at}</div>
        </div>
        <div className='content'>{content}</div>
      </div>
    );
  }
}

class Chat extends Component {
  getQuery() {
    return [[
      ['messages'],
      [
        'messages',
        _.range(0, store.get(['messages']).length),
        Message.queryFragment
      ],
      [
        'users',
        _.range(0, store.get(['users']).length),
        User.queryFragment
      ]
    ]];
  }

  componentWillMount() {
    this.sub = new PaveSubscription({
      store,
      query: this.getQuery(),
      onChange: sub => {
        this.setState({
          messages: _.sortBy(store.get(['messages']), 'at'),
          users: store.get(['users'])
        });
        sub.setQuery(this.getQuery());
      }
    });
  }

  componentDidUpdate() {
    this.messages.scrollTop = this.messages.scrollHeight;
  }

  componentWillUnmount() {
    this.sub.destroy();
  }

  handleKeyDown({key}) {
    if (key === 'Enter') {
      this.sub.run({query: ['createMessage!', {content: this.content.value}]});
      this.content.value = '';
    }
  }

  render() {
    return (
      <div className='chat'>
        <div className='left-panel'>
          <div className='messages' ref={c => this.messages = c}>
            {_.map(this.state.messages, (message, key) =>
              <Message key={key} message={message} />
            )}
          </div>
          <input
            className='content-input'
            ref={c => this.content = c}
            type='text'
            placeholder='Send a message...'
            onKeyDown={::this.handleKeyDown}
          />
        </div>
        <div className='right-panel'>
          {_.map(this.state.users, (user, key) =>
            <User key={key} user={user} />
          )}
        </div>
      </div>
    );
  }
}

class SignIn extends Component {
  componentWillMount() {
    this.sub = new PaveSubscription({
      store,
      onChange: sub =>
        this.setState({
          error: sub.error,
          isLoading: sub.isLoading
        })
    });
  }

  componentWillUnmount() {
    this.sub.destroy();
  }

  handleKeyDown({key}) {
    if (key === 'Enter') {
      const {username: {value: username}, password: {value: password}} = this;
      this.sub.run({query: ['signIn!', {username, password}]});
    }
  }

  render() {
    const {error, isLoading} = this.state;
    if (isLoading) return <div>Loading...</div>;
    return (
      <div>
        <div>Sign in with your OrgSync credentials</div>
        {error ? <div>{error.toString()}</div> : null}
        <input
          ref={c => this.username = c}
          type='email'
          placeholder='Username'
          onKeyDown={::this.handleKeyDown}
        />
        <input
          ref={c => this.password = c}
          type='password'
          placeholder='Password'
          onKeyDown={::this.handleKeyDown}
        />
      </div>
    );
  }
}

class Index extends Component {
  componentWillMount() {
    this.sub = new PaveSubscription({
      store,
      query: ['userId'],
      onChange: sub =>
        this.setState({
          error: sub.error,
          isLoading: sub.isLoading,
          isSignedIn: !!store.get(['userId'])
        })
    });

    const key = store.get(['key']);
    if (key) this.sub.run({query: ['auth!', key]});
  }

  componentWillUnmount() {
    this.sub.destroy();
  }

  render() {
    const {error, isLoading, isSignedIn} = this.state;
    return (
      <div className='root'>
        {error}
        {
          isLoading ? 'Loading...' :
          isSignedIn ? <Chat /> :
          <SignIn />
        }
      </div>
    );
  }
}

ReactDOM.render(<Index />, document.getElementById('main'));
