const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const root = path.resolve(__dirname, '../..')
const views = require('../../miniprogram/utils/principal-view')
const settle = () => new Promise(resolve => setImmediate(resolve))
function deferred() { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b }); return {promise,resolve,reject} }
function page(query = async () => response()) {
  let definition
  const calls = []
  const exports = []
  const toasts = []
  vm.runInNewContext(readFileSync(path.join(root,'miniprogram/pages/principal/index.js'),'utf8'), {
    Page: value => { definition=value }, wx: {getStorageSync:()=>({customer_access:{detail_tabs:{follow_up:true}}}),
      showToast(value){toasts.push(value)},env:{USER_DATA_PATH:'/mock'},
      getFileSystemManager:()=>({writeFile:options=>options.success()}),openDocument:options=>options.success()}, getApp:()=>({checkLogin:()=>true}), console,
    require: key => key.endsWith('/api') ? {principalApi:{query:params=>{calls.push(params);return query(params)},
      export:async params=>{exports.push(params);return new ArrayBuffer(0)}},customerApi:{}}
      : key.endsWith('/config') ? {BASE_URL:'http://local.invalid'} : require(path.join(root,'miniprogram/pages/principal',key)),
  })
  definition.data = structuredClone(definition.data)
  definition.data.metadata = {can_view_follow_up:true,transaction_access:'detail'}
  definition.setData = function(patch, done) {
    for (const [key,value] of Object.entries(patch)) {
      const fields=key.replace(/\[(\d+)\]/g,'.$1').split('.')
      let owner=this.data
      for (const field of fields.slice(0,-1)) owner=owner[field] ??= {}
      owner[fields.at(-1)] = value
    }
    done?.()
  }
  return {page:definition,calls,exports,toasts}
}
function response(items=[],extra={}) { return {items,total:items.length,page:1,page_size:20,columns:[],summary:{'引流人数':1,'课程数':1},breakdown:{traffic:[],deals:[],courses:{by_type:[],by_teacher:[]}},...extra} }
const person={id:'p',customer_id:'p',customer:'用户甲',member_type:'年卡',participant_role:'案主',org_participation_count:23,org_participation_hours:46,
  follow_up:'继续练习',follow_up_entries:[{id:'n1',author:'反馈甲',content:'继续练习',next_follow_up_person:'承接乙',next_follow_up_date:'2026-10-21'}, {id:'n2',author:'反馈丙',content:'另一条'}]}
const card={id:'gcs:1',course_id:'gcs:1',organization_id:'org',organization:'测试组织',name:'测试课程',date:'2026-10-01',type:'觉醒游戏',teachers:'老师',hours:2,participants:[person]}

test('各卡片导出带上板块和当前筛选，由同一服务端计算汇总，不上传客户端数量',async()=>{
  for(const group of ['traffic','invite','participation','courses','deals']) {
    const {page:p,exports,toasts}=page()
    p.data.query.tab='overview';p.data.overviewGroup=group
    p.data.picks=['traffic:老师甲'];p.data.listViewIndex=1
    p.data.cards=[{count:99999}]
    await p.exportData()
    assert.equal(exports.length,1)
    assert.equal(exports[0].export_group,group)
    assert.deepEqual(Array.from(exports[0].breakdown),['traffic:老师甲'])
    assert.equal(exports[0].list_view,'customer')
    assert(!JSON.stringify(exports[0]).includes('99999'))
    assert.equal(toasts.length,0)
    assert.equal(p.data.busy,false)
  }
})

test('五张卡包含活动参与，活动筛选只显示角色人数，沙龙不出现案主',()=>{
  const {page:p}=page()
  assert.deepEqual(Array.from(p.buildCards(response()),c=>c.key),['traffic','invite','participation','courses','deals'])
  p.data.overviewGroup='participation'
  p.data.picks=['participation_type:class']
  const data=response([],{breakdown:{traffic:[],deals:[],participation:{by_type:[{key:'class',label:'沙龙活动',owner_people:99,participant_people:3,count:999,subtypes:[{key:'读书会',label:'读书会',participant_people:2}]}],by_participant:[{key:'p',label:'用户',owner_people:0,participant_people:1}],totals:{count:5,people:3,participant_count:5,participant_people:3}}}})
  const panel=p.buildPanel(data)
  assert.deepEqual(Array.from(panel.panelSelects,s=>s.label),['活动类型','沙龙类型','参与者'])
  assert.equal(panel.showParticipationOwners,false)
  for(const sel of panel.panelSelects) assert(!JSON.stringify(sel).includes('999'))
  assert(!JSON.stringify(panel.panelMetrics).includes('案主'))
  assert.equal(panel.panelMetrics[0].value,'5 次')
})

test('个人范围只列有引流的个人，清除旧组织、拆分筛选和转化分析',async()=>{
  const {page:p,calls}=page()
  p.data.referrers=[{id:'ref',name:'引流甲',count:2}]
  p.data.organizations=[{id:'',name:'全部'},{id:'org',name:'组织'}]
  p.data.picks=['type:沙龙活动'];p.data.query.tab='conversion';p.data.query.organization_id='org'
  p.onScopeType({detail:{value:1}});await settle()
  assert.equal(p.data.query.scope_type,'person');assert.equal(p.data.query.referrer_id,'ref');assert.equal(p.data.query.organization_id,'')
  assert.equal(p.data.query.tab,'overview');assert.equal(p.data.tabs.length,1);assert.equal(p.data.picks.length,0)
  assert.equal(calls.at(-1).scope_type,'person');assert.equal(calls.at(-1).referrer_id,'ref')
  p.onScopeType({detail:{value:0}});await settle()
  assert.equal(p.data.query.referrer_id,'');assert.equal(p.data.query.scope_type,'organization');assert.equal(p.data.tabs.length,2)
})

test('全部时间与自定义日期都不会早于2026，人数课时显示单位',async()=>{
  const {page:p}=page()
  p.clearDates();await settle();assert.equal(p.data.query.date_from,'2026-01-01')
  p.onDate({currentTarget:{dataset:{field:'date_from'}},detail:{value:'2025-01-01'}});await settle();assert.equal(p.data.query.date_from,'2026-01-01')
  p.data.overviewGroup='courses'
  const display=p.buildListRow({name:'课',hours:2,participants:3},[{key:'name',label:'课程'},{key:'hours',label:'课时数'},{key:'participants',label:'到场人数'}],false,false)
  assert.deepEqual(Array.from(display.rowNumbers,r=>r.value).sort(),['2 课时','3 人'])
})

test('活动按类型归类，展开保留全部逐次记录及身份日期老师',()=>{
  const activities=Array.from({length:7},(_,i)=>({date:`2026-10-${10+i}`,name:`课${i}`,type:i%2?'沙龙活动':'觉醒游戏',role:i%2?'参与者':'案主',teachers:'老师甲'}))
  const collapsed=views.participationRow({id:'p',count:7,activities})
  assert.equal(collapsed.visibleGroups.flatMap(g=>g.records).length,4)
  const expanded=views.participationRow(collapsed,true)
  assert.equal(expanded.visibleGroups.flatMap(g=>g.records).length,7)
  assert(expanded.visibleGroups.flatMap(g=>g.records).every(a=>a.date&&a.role&&a.teachers))
  assert.equal(expanded.groups.length,2)
})

test('课程分组按课分页，仅显示四个人，反馈归属及下次安排不会丢失',async()=>{
  const {page:p,calls}=page(async()=>response([{...card,participants:[person,...Array.from({length:5},(_,i)=>({...person,id:`p${i}`,customer_id:`p${i}`}))]}]))
  p.data.overviewGroup='courses';p.data.query.course_view='participant'
  await p.loadData(true)
  assert.equal(calls[0].participant_layout,'courses');assert.equal(p.data.participantCards,true)
  assert.equal(p.data.list[0].visiblePeople.length,4)
  p.toggleCoursePeople({currentTarget:{dataset:{course:card.course_id}}});assert.equal(p.data.list[0].visiblePeople.length,6)
  const note=p.data.list[0].people[0].feedback.find(f=>f.key==='follow_up')
  assert.equal(note.entries[0].author,'反馈甲');assert.equal(note.entries[0].nextFollowUpText,'承接乙 10/21');assert.equal(note.count,2)
  p.openTeacherDetail({currentTarget:{dataset:{course:card.course_id,id:'p'}}})
  assert.equal(p.data.teacherDetail.sections[2].entries[0].nextFollowUpText,'承接乙 10/21')
  assert.equal(views.courseCard(card,false).people[0].feedback.length,0)
})

test('新条件覆盖旧请求，活动板块参数不会落入课程板块',async()=>{
  const first=deferred(),second=deferred();let n=0
  const {page:p,calls}=page(()=>++n===1?first.promise:second.promise)
  p.data.overviewGroup='courses';const old=p.loadData(true)
  p.data.overviewGroup='participation';const current=p.loadData(true)
  second.resolve(response([{id:'member',activities:[],name:'最新',count:1}]));await current
  first.resolve(response([{id:'old'}]));await old
  assert.equal(calls[1].mobile_group,'participation');assert.equal(p.data.list[0].id,'member')
})

test('累计课程按点击的用户和组织查询，翻页、切换历史、错误重试及关闭防旧响应',async()=>{
  const historyCalls=[];let fail=false;let pending
  const {page:p}=page(async q=>{
    historyCalls.push(q)
    if(pending)return pending.promise
    if(fail){fail=false;throw new Error('暂时失败')}
    return response(Array.from({length:q.page===1?20:3},(_,i)=>({id:`${q.page}-${i}`})),{total:23,page:q.page})
  })
  p._sourceRows=[card];p.data.query.scope_type='person';p.data.query.referrer_id='ref'
  p.openHistory({currentTarget:{dataset:{course:card.course_id,id:'p'}}});await settle()
  assert.equal(historyCalls[0].scope_type,'person');assert.equal(historyCalls[0].referrer_id,'ref');assert.equal(historyCalls[0].participant_history_organization_id,'org')
  assert.equal(historyCalls[0].participant_layout,'rows');assert.equal(historyCalls[0].customer_id,'p');assert.equal(historyCalls[0].breakdown.length,0)
  await p.loadHistory();assert.equal(p.data.historySheet.rows.length,23);assert.equal(p.data.historySheet.hasMore,false)
  fail=true;p.onHistoryRange({currentTarget:{dataset:{all:'true'}}});await settle();assert.equal(p.data.historySheet.error,'暂时失败')
  assert.equal(historyCalls.at(-1).date_from,'2026-01-01');assert.equal(historyCalls.at(-1).date_to,null)
  p.retryHistory();await settle();assert.equal(p.data.historySheet.error,'');assert.equal(p.data.historySheet.rows.length,20)
  pending=deferred();const late=p.loadHistory();p.closeHistory();pending.resolve(response([{id:'late'}]));await late
  assert.equal(p.data.historySheet,null)
})


test('归档组织默认隐藏，包含归档仅改变候选项，取消后清除已选归档组织',async()=>{
  const raw=[{id:'active',name:'运营组织'},{id:'old',name:'历史组织',status:'archived'}]
  assert.deepEqual(views.organizationScopeOptions(raw).map(org=>org.id),['','active'])
  assert.deepEqual(views.organizationScopeOptions(raw,true).map(org=>org.id),['','active','old'])
  assert.equal(views.organizationScopeOptions(raw,false,'old').at(-1).name,'历史组织（已归档）')
  assert.equal(raw[1].name,'历史组织')
  const {page:p,calls}=page()
  p.data.metadata.organizations=raw
  p.toggleArchivedOrganizations()
  assert.equal(p.data.includeArchived,true);assert.equal(p.data.scopeTargets.length,3)
  assert.equal(calls.length,0)
  p.onScopeTarget({detail:{value:2}});await settle()
  assert.equal(calls.at(-1).organization_id,'old')
  p.toggleArchivedOrganizations();await settle()
  assert.equal(p.data.query.organization_id,'');assert.equal(p.data.includeArchived,false)
  assert.equal(p.data.scopeTargets.length,2)
})
