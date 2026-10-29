import os
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from app import app, app_state


class PublicReleaseTest(unittest.TestCase):
    def setUp(self):
        self.previous = app.config['PUBLIC_RELEASE']
        self.state = dict(app_state)
        app.config['PUBLIC_RELEASE'] = True
        app_state['ai_enabled'] = True
        self.client = app.test_client()
        self.payload = {'userInput': '歩くプログラム', 'currentProgram': '# Stage', 'currentAssets': {'targets': []}}

    def tearDown(self):
        app.config['PUBLIC_RELEASE'] = self.previous
        app_state.update(self.state)

    def test_no_ai_request_before_consent(self):
        with patch('openai.OpenAI') as provider:
            for path in ['/api/llm', '/api/repair-scratch', '/api/plan-assets', '/api/plan-sprites']:
                self.assertEqual(self.client.post(path, json=self.payload).status_code, 403)
            provider.assert_not_called()

    def test_public_admin_endpoints_are_disabled(self):
        for path in ['/admin', '/api/admin/events', '/api/admin/toggle-ai', '/api/events/unknown']:
            self.assertEqual(self.client.get(path).status_code, 404)
        self.assertEqual(self.client.get('/api/status').status_code, 200)

    def test_generated_response_is_not_stored_and_is_moderated(self):
        provider = MagicMock()
        provider.moderations.create.return_value = SimpleNamespace(results=[SimpleNamespace(flagged=False)])
        provider.chat.completions.create.return_value = SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content='プログラムの説明'))],
            model_dump=lambda: {'choices': []})
        with patch.dict(os.environ, {'OPENAI_API_KEY': 'test-key'}), patch('openai.OpenAI', return_value=provider) as factory:
            response = self.client.post('/api/llm', json=self.payload, headers={'X-SLLM-Consent': '2026-10-29'})
        self.assertEqual(response.status_code, 200)
        self.assertFalse(provider.chat.completions.create.call_args.kwargs['store'])
        self.assertEqual(provider.moderations.create.call_count, 2)
        self.assertEqual(factory.call_args.kwargs['base_url'], 'https://api.openai.com/v1')

    def test_provider_error_does_not_expose_prompt_or_secret(self):
        provider = MagicMock()
        provider.moderations.create.return_value = SimpleNamespace(results=[SimpleNamespace(flagged=False)])
        provider.chat.completions.create.side_effect = RuntimeError('private-input-value secret-key-value')
        with patch.dict(os.environ, {'OPENAI_API_KEY': 'test-key'}), patch('openai.OpenAI', return_value=provider):
            with self.assertLogs(app.logger, level='WARNING') as logs:
                response = self.client.post('/api/llm', json=self.payload, headers={'X-SLLM-Consent': '2026-10-29'})
        self.assertEqual(response.status_code, 500)
        serialized = response.get_data(as_text=True) + str(logs.output)
        self.assertNotIn('private-input-value', serialized)
        self.assertNotIn('secret-key-value', serialized)


if __name__ == '__main__':
    unittest.main()
