import test from 'node:test';
import assert from 'node:assert/strict';
import { RealtimeClient, CONNECTION_STATES } from '../public/js/overlay/realtime-client.js';

test('RealtimeClient: buildProgressUrl and buildEventsUrl support workspace slugs', () => {
  const clientWithSlug = new RealtimeClient({ workspaceSlug: 'streamer-charlie' });
  assert.equal(clientWithSlug.buildProgressUrl(), '/progress?slug=streamer-charlie');
  assert.equal(clientWithSlug.buildEventsUrl(), '/events?slug=streamer-charlie&source=overlay');
  assert.equal(clientWithSlug.buildSettingsUrl(), '/overlay-settings?slug=streamer-charlie');

  const clientDefault = new RealtimeClient();
  assert.equal(clientDefault.buildProgressUrl(), '/progress');
  assert.equal(clientDefault.buildEventsUrl(), '/events?source=overlay');
  assert.equal(clientDefault.buildSettingsUrl(), '/overlay-settings');
});

test('RealtimeClient: connection state lifecycle transitions', () => {
  const states = [];
  const client = new RealtimeClient({
    onConnectionStateChange: (st) => states.push(st)
  });

  assert.equal(client.getConnectionState(), CONNECTION_STATES.OFFLINE);

  client.setConnectionState(CONNECTION_STATES.CONNECTING);
  assert.equal(client.getConnectionState(), CONNECTION_STATES.CONNECTING);

  client.setConnectionState(CONNECTION_STATES.CONNECTED);
  assert.equal(client.getConnectionState(), CONNECTION_STATES.CONNECTED);

  client.setConnectionState(CONNECTION_STATES.RECONNECTING);
  assert.equal(client.getConnectionState(), CONNECTION_STATES.RECONNECTING);

  client.disconnect();
  assert.equal(client.getConnectionState(), CONNECTION_STATES.OFFLINE);

  assert.deepEqual(states, [
    CONNECTION_STATES.CONNECTING,
    CONNECTION_STATES.CONNECTED,
    CONNECTION_STATES.RECONNECTING,
    CONNECTION_STATES.OFFLINE
  ]);
});
