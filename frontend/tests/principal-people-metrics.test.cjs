const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const React = require('react')

const source = fs.readFileSync(path.join(__dirname, '../src/pages/principal/index.tsx'), 'utf8')
const metricsSource = source.slice(source.indexOf('  const overviewCards ='), source.indexOf('  const showTrafficList ='))
function metrics(group) {
  const context = {
    React, overviewGroup: group, personalScope: false, showParticipationOwners: true,
    trafficVisitStats: { invitedCount: 12, invitedPeople: 3, cancelledCount: 4, cancelledPeople: 2,
      noShowCount: 3, noShowPeople: 1, arrivedCount: 5, arrivedPeople: 2 },
    inviteInitiatedTotal: 15, inviteInitiatedPeople: 4,
    overviewMetrics: {}, listScope: { 上课人数: 3, 上课人次: 12, 服务总人数: 4, 服务人次: 20, 服务案主人数: 2, 服务参与者人数: 3, 升单人: 2, 升单量: 6 },
    result: { summary: { 活动参与次数: 18, 活动案主次数: 6, 活动参与者次数: 12 } },
    breakdown: { participation: { overall: { people: 5, owner_people: 2, participant_people: 4 }, totals: { people: 3, owner_people: 1, participant_people: 3 } } },
  }
  vm.runInNewContext(ts.transpileModule(metricsSource + '\nglobalThis.output = { overviewCards, panelMetrics }', {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText, context)
  return context.output
}

test('顶部邀约和活动采用后端去重人数，不把记录次数换单位冒充人数', () => {
  const { overviewCards, panelMetrics } = metrics('invite')
  assert.equal(overviewCards.find(x => x.id === 'invite').value, '3')
  assert.equal(overviewCards.find(x => x.id === 'invite').unit, '人')
  assert.equal(overviewCards.find(x => x.id === 'participation').value, '5')
  assert.deepEqual(Array.from(panelMetrics, x => x.text), ['3 人', '2 人', '1 人', '2 人', '4 人'])
})

test('活动、上课、服务及升单使用所选范围人数，删除重复次数指标', () => {
  assert.deepEqual(Array.from(metrics('participation').panelMetrics, x => x.text), ['3 人'])
  const courses = metrics('courses').panelMetrics
  assert.equal(courses.find(x => x.label === '上课人数').text, '3 人')
  assert.equal(courses.find(x => x.label === '服务人数').text, '4 人')
  const deals = metrics('deals').panelMetrics
  assert.equal(deals.find(x => x.label === '升单人数').text, '2 人')
  assert.equal(deals.some(x => x.label === '升单量'), false)
})
