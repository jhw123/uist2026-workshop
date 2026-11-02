import unittest
from unittest.mock import patch

import server


class GroundingTests(unittest.TestCase):
    def test_details_discard_invented_quotes_and_unknown_criteria(self):
        data = {'text': 'Easy to steer but expensive.', 'criteria': [{'name': 'Price'}, {'name': 'Maneuverability'}], 'options': ['Cruz']}
        reply = {'phrases': [
            {'quote': 'expensive', 'criterion': 'Price', 'sentiment': 'negative', 'option': 'Cruz'},
            {'quote': 'invented quote', 'criterion': 'Price', 'sentiment': 'positive'},
            {'quote': 'Easy to steer', 'criterion': 'Unknown', 'sentiment': 'positive'}]}
        with patch.object(server, 'ask', return_value=reply):
            self.assertEqual(server.dispatch('detail', data)['phrases'], [reply['phrases'][0]])

    def test_classification_rejects_unknown_ids_and_criteria(self):
        data = {'paragraphs': [{'id': 'p0', 'text': 'Expensive.'}], 'criteria': [{'name': 'Price'}]}
        reply = {'options': ['Cruz'], 'paragraphs': [
            {'id': 'p0', 'criteria': ['Price', 'Invented'], 'options': ['Cruz', 'Fake']},
            {'id': 'p9', 'criteria': ['Price']}]}
        with patch.object(server, 'ask', return_value=reply):
            result = server.dispatch('page', data)
        self.assertEqual(result['paragraphs'], [{'id': 'p0', 'criteria': ['Price'], 'options': ['Cruz']}])

    def test_incomplete_classification_is_not_silently_accepted(self):
        data = {'paragraphs': [{'id': 'p0', 'text': 'Expensive.'}], 'criteria': [{'name': 'Price'}]}
        with patch.object(server, 'ask', return_value={'options': [], 'paragraphs': []}):
            with self.assertRaises(ValueError):
                server.dispatch('page', data)

    def test_recommendations_are_unseen_unique_and_at_most_two(self):
        with patch.object(server, 'ask', return_value={'criteria': ['Price', 'Safety', 'Safety', 'Warranty', 'Storage']}):
            result = server.dispatch('recommend', {'unseen': ['Safety', 'Warranty', 'Storage']})
        self.assertEqual(result, {'criteria': ['Safety', 'Warranty']})

    def test_criteria_deduplicate_case_insensitively(self):
        self.assertEqual(server.criteria_items([{'name': 'Price'}, {'name': 'price'}]), [{'name': 'Price', 'description': ''}])

    def test_new_criteria_are_ranked_with_existing_ones(self):
        data = {'existing': [{'name': 'Price', 'description': 'Cost'}]}
        with patch.object(server, 'ask', return_value={'criteria': [{'name': 'Safety'}], 'order': ['Safety', 'Price']}):
            self.assertEqual(server.dispatch('criteria', data)['order'], ['Safety', 'Price'])

    def test_ranking_cannot_drop_existing_criteria(self):
        with patch.object(server, 'ask', return_value={'criteria': [{'name': 'Safety'}], 'order': ['Safety']}):
            with self.assertRaises(ValueError):
                server.dispatch('criteria', {'existing': [{'name': 'Price'}]})


if __name__ == '__main__':
    unittest.main()
