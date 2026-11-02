import io
import json
import unittest
from unittest.mock import patch
import server


class Reply(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self, *args): self.close()


class PipelineTests(unittest.TestCase):
    def test_fenced_json_and_missing_code(self):
        self.assertEqual(server.parse_reply('```json\n{"updatedCode":"() => <div />"}\n```')['updatedCode'], '() => <div />')
        for invalid in ['{}', '[]', 'not JSON', '{"updatedCode":""}']:
            with self.assertRaises(ValueError): server.parse_reply(invalid)

    def test_semantic_controls_are_bounded_and_independent(self):
        groups = server.normalize_groups([{'category': 'Colors', 'controls': [
            {'type': 'color', 'value': 'red'},
            {'type': 'range', 'min': 0, 'max': 20, 'value': 999, 'step': 0},
            {'type': 'select', 'options': ['one', 'two'], 'value': 'missing'}]},
            {'category': 'Layout'}])
        self.assertEqual(groups[0]['controls'][0]['value'], '#7c5ce7')
        self.assertEqual(groups[0]['controls'][1]['value'], 20)
        self.assertGreater(groups[0]['controls'][1]['step'], 0)
        self.assertEqual(groups[0]['controls'][2]['value'], 'one')
        self.assertNotEqual(groups[0]['id'], groups[1]['id'])

    def test_local_blend_passes_exact_target_image_and_source(self):
        captured = {}
        def respond(request, **kwargs):
            captured.update(json.loads(request.data))
            return Reply(json.dumps({'choices': [{'message': {'content': json.dumps({
                'updatedCode': '() => <main>Fuji</main>',
                'categorizedChanges': [{'category': 'Layout', 'description': 'Horizontal interests'}]
            })}}]}).encode())
        payload = {'code': '() => <main>Fuji</main>', 'image': 'data:image/png;base64,AAAA',
                   'target': {'html': '<section>Interests</section>', 'selector': '#root section'},
                   'aspects': ['Layout'], 'instruction': 'Preserve the light theme',
                   'crop': {'x': 0, 'y': .5, 'w': 1, 'h': .4}}
        with patch('server.urllib.request.urlopen', respond): result = server.model_request(payload, 'blend')
        parts = captured['messages'][1]['content']
        context = json.loads(parts[1]['text'])
        self.assertEqual(context['operation'], 'localized blend')
        self.assertEqual(context['targetDOM'], payload['target'])
        self.assertEqual(context['aspects'], ['Layout'])
        self.assertEqual(parts[2]['image_url']['url'], payload['image'])
        self.assertIn(payload['code'], parts[0]['text'])
        self.assertTrue(result['categorizedChanges'][0]['enabled'])

    def test_refine_supplies_original_full_blend_and_semantic_decisions(self):
        captured = {}
        def respond(request, **kwargs):
            captured.update(json.loads(request.data))
            return Reply(json.dumps({'choices': [{'message': {'content': '{"updatedCode":"() => <main />"}'}}]}).encode())
        payload = {'code': 'current', 'originalCode': 'original', 'fullBlendCode': 'full blend',
                   'groups': [{'id': 'color', 'enabled': False}, {'id': 'layout', 'enabled': True}]}
        with patch('server.urllib.request.urlopen', respond): server.model_request(payload, 'refine')
        text = captured['messages'][1]['content'][1]['text']
        self.assertIn('original', text)
        self.assertIn('full blend', text)
        self.assertIn('"enabled": false', text)
        self.assertIn('"enabled": true', text)

    def test_invalid_input_never_calls_bridge(self):
        with patch('server.urllib.request.urlopen') as call:
            with self.assertRaises(ValueError): server.model_request({'code': ''}, 'blend')
            with self.assertRaises(ValueError): server.model_request({'code': 'x', 'image': 'http://example.com/a.png'}, 'blend')
            call.assert_not_called()


if __name__ == '__main__': unittest.main()
