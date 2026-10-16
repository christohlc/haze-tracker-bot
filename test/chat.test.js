import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupDashboardUrl, isAnonymousAdmin, parseCommand, replyTo, subscriberTarget, toSenderOnly, topicOf } from '../tgcloud/lib/chat-rules.js';

test('commands addressed to another bot are ignored', () => {
  assert.deepEqual(parseCommand('/haze@HazeBot east 30', 'hazebot'), { cmd: 'haze', args: ['east', '30'] });
  assert.equal(parseCommand('/start@OtherBot', 'HazeBot'), null);
  assert.deepEqual(parseCommand('/HAZE', 'HazeBot'), { cmd: 'haze', args: [] });
  assert.deepEqual(parseCommand('/help@OtherBot', null), { cmd: 'help', args: [] });
  assert.equal(parseCommand('hello', 'HazeBot'), null);
});

test('replies go to the topic, and privately after an ephemeral command', () => {
  const chat = { id: -100 };
  assert.deepEqual(replyTo({ chat: { id: 5 }, from: { id: 5 } }), { chat_id: 5 });
  assert.deepEqual(replyTo({ chat, is_topic_message: true, message_thread_id: 7 }), { chat_id: -100, message_thread_id: 7 });
  // message_thread_id without is_topic_message is a reply thread, not a topic
  assert.equal(topicOf({ chat, message_thread_id: 7 }), null);
  assert.deepEqual(replyTo({ chat, from: { id: 9 }, ephemeral_message_id: 3 }), {
    chat_id: -100,
    reply_parameters: { ephemeral_message_id: 3 },
    ephemeral_message_parameters: { receiver_user_id: 9 },
  });
});

test('sender-only replies are ephemeral in groups only', () => {
  assert.deepEqual(toSenderOnly({ chat: { id: 5 }, from: { id: 5 } }), { chat_id: 5 });
  assert.deepEqual(toSenderOnly({ chat: { id: -100 }, from: { id: 9 } }), { chat_id: -100, ephemeral_message_parameters: { receiver_user_id: 9 } });
});

test('alerts go to the subscribed topic', () => {
  assert.equal(subscriberTarget({ chatId: -100, threadId: null }), -100);
  assert.deepEqual(subscriberTarget({ chatId: -100, threadId: 7 }), { chat_id: -100, message_thread_id: 7 });
});

test('anonymous admins post as the group', () => {
  assert.equal(isAnonymousAdmin({ chat: { id: -100 }, sender_chat: { id: -100 } }), true);
  assert.equal(isAnonymousAdmin({ chat: { id: -100 }, sender_chat: { id: -200 } }), false);
  assert.equal(isAnonymousAdmin({ chat: { id: -100 }, from: { id: 1 } }), false);
});

test('group dashboard link opens the main Mini App if there is one', () => {
  assert.equal(groupDashboardUrl({ username: 'HazeBot', has_main_web_app: true }), 'https://t.me/HazeBot?startapp');
  assert.equal(groupDashboardUrl({ username: 'HazeBot' }), 'https://t.me/HazeBot?start=dashboard');
});
