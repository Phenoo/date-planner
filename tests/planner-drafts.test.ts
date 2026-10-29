import { test } from "node:test";
import assert from "node:assert/strict";
import { restorePlannerStep, plannerQuestions, plannerQuestionCount, plannerDraftVersion } from "../lib/planner/questions";
test("older seven-stage drafts resume at the same semantic question", () => {
  assert.deepEqual([0,1,2,3,4,5,6].map(step => plannerQuestions[restorePlannerStep(step,3)].id), ["city","occasion","budget","vibes","interests","date","interests"]);
});
test("v4 drafts migrate by question identity after the new start and review screens", () => {
  const old=["city","area","occasion","budget","people","vibes","interests","requirements","date","time","duration","notes"];
  old.forEach((id,index) => assert.equal(plannerQuestions[restorePlannerStep(index,4)].id,id === "notes" ? "interests" : id));
  for(let step=0;step<plannerQuestionCount;step++)assert.equal(restorePlannerStep(step,plannerDraftVersion),step);
});
test("damaged draft positions cannot select a missing question", () => {
  for(const version of [undefined,3,4,5,6,7,8,9,10,plannerDraftVersion]){
    assert.equal(restorePlannerStep(-10,version),0);
    assert.ok(restorePlannerStep(1000,version)<plannerQuestionCount);
    for(const step of [NaN,Infinity,1.5,"5",null])assert.equal(restorePlannerStep(step,version),0);
  }
  assert.equal(restorePlannerStep(5,99),0);
});
test("v7 drafts retain their question after the budget move and new gender steps", () => {
  const old = ["city", "area", "occasion", "people", "vibes", "interests", "requirements", "budget", "date", "time", "duration", "review"];
  old.forEach((id, index) => assert.equal(plannerQuestions[restorePlannerStep(index, 7)].id, id));
  const people = plannerQuestions.findIndex((question) => question.id === "people");
  assert.equal(plannerQuestions[people + 1].id, "vibes");
  assert.deepEqual(plannerQuestions.slice(0, 3).map(({ id }) => id), ["yourGender", "dateGender", "city"]);
  assert.deepEqual(plannerQuestions[people].fields, ["guests"]);
});
test("v5 drafts on the removed question resume at the combined preferences step", () => {
  const old=["intro","city","area","occasion","people","vibes","interests","requirements","budget","date","time","duration","notes","review"];
  old.forEach((id,index) => assert.equal(plannerQuestions[restorePlannerStep(index,5)].id,id === "intro" ? "city" : id === "notes" ? "interests" : id));
  assert.equal(plannerQuestions[plannerQuestionCount - 2].id,"duration");
  assert.equal(plannerQuestions[plannerQuestionCount - 1].id,"review");
});
test("v6 drafts keep their question when the introduction moves to the homepage", () => {
  const old=["intro","city","area","occasion","people","vibes","interests","requirements","budget","date","time","duration","review"];
  old.forEach((id,index) => assert.equal(plannerQuestions[restorePlannerStep(index,6)].id,id === "intro" ? "city" : id));
  assert.equal(plannerQuestions[0].id,"yourGender");
  assert.equal(plannerQuestions.some((question) => String(question.id) === "intro"),false);
  assert.equal(plannerQuestionCount - 1,13);
});
test("v8 and v9 drafts resume at the same question after gender questions are introduced", () => {
  const old = ["city", "area", "occasion", "people", "budget", "vibes", "interests", "requirements", "date", "time", "duration", "review"];
  for (const version of [8, 9]) old.forEach((id, step) => assert.equal(plannerQuestions[restorePlannerStep(step, version)].id, id));
});
test("v10 drafts keep every answer and their question when gender moves to the start", () => {
  const previous = ["city", "area", "occasion", "people", "yourGender", "dateGender", "budget", "vibes", "interests", "requirements", "date", "time", "duration", "review"];
  previous.forEach((id, step) => assert.equal(plannerQuestions[restorePlannerStep(step, 10)].id, id));
  assert.deepEqual(plannerQuestions.slice(0, 2).map(({ id }) => id), ["yourGender", "dateGender"]);
});
test("v11 drafts keep their answers and semantic question after budget moves behind preferences", () => {
  const previous = ["yourGender", "dateGender", "city", "area", "occasion", "people", "budget", "vibes", "interests", "requirements", "date", "time", "duration", "review"];
  previous.forEach((id, step) => assert.equal(plannerQuestions[restorePlannerStep(step, 11)].id, id));
});
