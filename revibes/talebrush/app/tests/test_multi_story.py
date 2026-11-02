import copy
import json
import unittest
from story import StoryError, generate, recognize, validate_request


def request():
    return {"schemaVersion": 2, "title": "Rivals", "characters": [
        {"id": "mike", "name": "Mike", "description": "A guitarist seeking a band"},
        {"id": "maya", "name": "Maya", "description": "A drummer seeking recognition"}],
        "dimensions": [{"id": "fortune", "name": "Fortune", "low": "Bad fortune", "high": "Good fortune"},
                       {"id": "confidence", "name": "Confidence", "low": "Uncertain", "high": "Self-assured"}],
        "activeCharacterId": "mike", "activeDimensionId": "fortune",
        "slots": [{"text": "Mike and Maya entered a competition."}, {"text": ""}, {"text": "They agreed to work together."}],
        "indices": [1], "surprises": [None, .4, None], "tracks": {
            "mike:fortune": {"characterId": "mike", "dimensionId": "fortune", "controls": [None, {"target": .9, "tolerance": .2}, None], "values": [None]*3},
            "maya:confidence": {"characterId": "maya", "dimensionId": "confidence", "controls": [None, {"target": .1, "tolerance": .2}, None], "values": [None]*3}}}


class MultiStoryTests(unittest.TestCase):
    def test_generation_combines_characters_and_dimensions_and_scores_independently(self):
        calls=[]
        def model(system,data):
            calls.append(data)
            if len(calls)==1:
                self.assertEqual(len(data["characters"]),2)
                controls=data["requested"][0]["constraints"]
                self.assertEqual({c["characterId"] for c in controls},{"mike","maya"})
                self.assertEqual({c["dimensionId"] for c in controls},{"fortune","confidence"})
                self.assertIn("They agreed to work together.",json.dumps(data))
                return {"candidates":[{"index":1,"options":["Mike lost while Maya felt confident.","Mike won while Maya doubted herself."]}]}
            self.assertNotIn('target',json.dumps(data))
            self.assertNotIn('tolerance',json.dumps(data))
            return {"scores":[{"id":"1:0","values":{"mike:fortune":.1,"maya:confidence":.9}},
                              {"id":"1:1","values":{"mike:fortune":.9,"maya:confidence":.1}}]}
        result=generate(request(),model)
        self.assertEqual(result["updates"][0]["text"],"Mike won while Maya doubted herself.")
        self.assertEqual(result["updates"][0]["values"],{"mike:fortune":.9,"maya:confidence":.1})
        self.assertEqual(len(calls),2)

    def test_invalid_unknown_pairs_duplicate_ids_and_scores_are_rejected(self):
        bodies=[]
        unknown=request();unknown["tracks"]["mike:fortune"]["characterId"]="unknown";bodies.append(unknown)
        duplicate=request();duplicate["characters"][1]["id"]="mike";bodies.append(duplicate)
        names=request();names["characters"][1]["name"]="MIKE";bodies.append(names)
        missing=request();missing["dimensions"][0]["low"]="";bodies.append(missing)
        length=request();length["tracks"]["mike:fortune"]["controls"].pop();bodies.append(length)
        bad=request();bad["tracks"]["mike:fortune"]["values"][0]=float("nan");bodies.append(bad)
        for body in bodies:
            with self.subTest(body=body),self.assertRaises(StoryError):validate_request(body)

    def test_recognition_separates_opposite_character_states(self):
        body=request();body["slots"][1]["text"]="Mike won, but Maya felt unsure."
        def model(system,data):
            self.assertNotIn('target',json.dumps(data))
            self.assertEqual({p['key'] for p in data['pairs']},{'mike:fortune','maya:confidence'})
            return {"scores":[{"id":str(i),"values":{"mike:fortune":.9,"maya:confidence":.1}} for i in range(3)]}
        result=recognize(body,model)
        self.assertEqual(result["scores"][1]["values"]["mike:fortune"],.9)
        self.assertEqual(result["scores"][1]["values"]["maya:confidence"],.1)

    def test_incomplete_multi_attribute_results_fail_without_partial_updates(self):
        body=request()
        answers=iter([{"candidates":[{"index":1,"options":["First.","Second."]}]},
                      {"scores":[{"id":"1:0","values":{"mike:fortune":.9}}]}])
        before=copy.deepcopy(body)
        with self.assertRaises(StoryError):generate(body,lambda *_:next(answers))
        self.assertEqual(body,before)


if __name__=='__main__':unittest.main()
