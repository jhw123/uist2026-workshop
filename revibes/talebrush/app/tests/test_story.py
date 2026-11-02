import json
import unittest

from story import StoryError, generate, recognize, validate_request


class StoryTests(unittest.TestCase):
    def payload(self):
        return {"protagonist": "Mira", "title": "The map", "slots": [
            {"text": "Mira found a map."}, {"text": ""},
            {"text": "Mira finally reached home."}],
            "indices": [1], "controls": [None, {"target": .2, "tolerance": .08}, None],
            "surprises": [None, .7, None]}

    def test_rejects_invalid_indices_and_nonfinite_scores(self):
        for indices in ([3], [-1], [True], [1, 1]):
            body = self.payload()
            body["indices"] = indices
            with self.assertRaises(StoryError):
                validate_request(body)
        body = self.payload()
        body["controls"][1]["target"] = float("nan")
        with self.assertRaises(StoryError):
            validate_request(body)

    def test_independent_recognition_and_best_candidate_preserve_anchors(self):
        calls = []
        def model(system, data):
            calls.append((system, data))
            if len(calls) == 1:
                self.assertIn("Mira finally reached home.", json.dumps(data))
                return {"candidates": [{"index": 1, "options": [
                    "Mira won a prize.", "Mira lost her map.", "Mira found a clue."]}]}
            self.assertNotIn("target", json.dumps(data))
            self.assertNotIn("tolerance", json.dumps(data))
            self.assertEqual(data["items"][0]["previous"], ["Mira found a map."])
            return {"scores": [{"id": "1:0", "fortune": .9},
                               {"id": "1:1", "fortune": .16},
                               {"id": "1:2", "fortune": .5}]}
        result = generate(self.payload(), model)
        self.assertEqual(result["updates"], [{"index": 1, "text": "Mira lost her map.",
                                            "fortune": .16, "source": "ai"}])
        self.assertEqual(len(calls), 2)

    def test_erased_target_does_not_steer_or_retry(self):
        body = self.payload()
        body["controls"][1] = None
        answers = iter([{"candidates": [{"index": 1, "options": ["Mira waited by the road."]}]},
                        {"scores": [{"id": "1:0", "fortune": .4}]}])
        result = generate(body, lambda *_: next(answers))
        self.assertEqual(result["updates"][0]["fortune"], .4)

    def test_good_first_candidate_is_kept(self):
        answers = iter([{"candidates": [{"index": 1, "options": ["First.", "Second.", "Third."]}]},
                        {"scores": [{"id": "1:0", "fortune": .35},
                                    {"id": "1:1", "fortune": .2},
                                    {"id": "1:2", "fortune": .1}]}])
        result = generate(self.payload(), lambda *_: next(answers))
        self.assertEqual(result["updates"][0]["text"], "First.")

    def test_missing_or_duplicate_candidates_fail_atomically(self):
        for output in ({"candidates": []}, {"candidates": [{"index": 1, "options": [""]}]},
                       {"candidates": [{"index": 0, "options": ["Changed anchor."]}]}):
            with self.assertRaises(StoryError):
                generate(self.payload(), lambda *_: output)

    def test_recognition_uses_three_previous_sentences_and_checks_all_scores(self):
        body = {"protagonist": "Mira", "slots": [{"text": f"Sentence {i}."} for i in range(6)]}
        def model(system, data):
            self.assertEqual(data["items"][-1]["previous"], ["Sentence 2.", "Sentence 3.", "Sentence 4."])
            return {"scores": [{"id": str(i), "fortune": .5} for i in range(6)]}
        self.assertEqual(len(recognize(body, model)["scores"]), 6)
        with self.assertRaises(StoryError):
            recognize(body, lambda *_: {"scores": []})

    def test_recognition_context_skips_blank_slots(self):
        body = {"protagonist": "Mira", "slots": [{"text": "Mira left home."},
                {"text": ""}, {"text": ""}, {"text": ""}, {"text": "Mira came back."}]}
        def model(system, data):
            self.assertEqual(data["items"][-1]["previous"], ["Mira left home."])
            return {"scores": [{"id": "0", "fortune": .5}, {"id": "4", "fortune": .8}]}
        recognize(body, model)


if __name__ == "__main__":
    unittest.main()
