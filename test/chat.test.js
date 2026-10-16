import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answerTargets, groupDashboardUrl, isAnonymousAdmin, parseCommand, subscriberTarget, topicOf } from '../tgcloud/lib/chat-rules.js';

test('commands addressed to another bot are ignored', () => {
  assert.deepEqual(parseCommand('/haze@HazeBot east 30', 'hazebot'), { cmd: 'haze', args: ['east', '30'] });
  assert.equal(parseCommand('/start@OtherBot', 'HazeBot'), null);
  assert.deepEqual(parseCommand('/HAZE', 'HazeBot'), { cmd: 'haze', args: [] });
  // bot's name unknown (getMe failed): a named command might be for another bot
  assert.equal(parseCommand('/help@OtherBot', null), null);
  assert.deepEqual(parseCommand('/help', null), { cmd: 'help', args: [] });
  assert.equal(parseCommand('hello', 'HazeBot'), null);
});

test('answers go to the topic, and privately after an ephemeral command', () => {
  const chat = { id: -100 };
  const user = { id: 9 };
  assert.deepEqual(answerTargets({ chat: { id: 5 }, from: { id: 5 } }), [{ chat_id: 5 }]);
  assert.deepEqual(answerTargets({ chat, from: user, is_topic_message: true, message_thread_id: 7 }), [{ chat_id: -100, message_thread_id: 7 }]);
  // message_thread_id without is_topic_message is a reply thread, not a topic
  assert.equal(topicOf({ chat, message_thread_id: 7 }), null);
  const ephemeral = { chat_id: -100, ephemeral_message_parameters: { receiver_user_id: 9 } };
  // past the 15 s window the reply part is dropped, never made visible
  assert.deepEqual(answerTargets({ chat, from: user, ephemeral_message_id: 3 }), [{ ...ephemeral, reply_parameters: { ephemeral_message_id: 3 } }, ephemeral]);
});

test('sender-only answers are ephemeral in groups, else visible', () => {
  assert.deepEqual(answerTargets({ chat: { id: 5 }, from: { id: 5 } }, true), [{ chat_id: 5 }]);
  assert.deepEqual(answerTargets({ chat: { id: -100 }, from: { id: 9 } }, true), [{ chat_id: -100, ephemeral_message_parameters: { receiver_user_id: 9 } }, { chat_id: -100 }]);
  // anonymous admins write as GroupAnonymousBot, and ephemeral messages can't go to bots
  const anon = { chat: { id: -100 }, from: { id: 1087968824, is_bot: true }, sender_chat: { id: -100 }, ephemeral_message_id: 3 };
  assert.deepEqual(answerTargets(anon, true), [{ chat_id: -100 }]);
});

test('alerts go to the subscribed topic', () => {
  assert.deepEqual(subscriberTarget({ chatId: -100, threadId: null }), { chat_id: -100 });
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
