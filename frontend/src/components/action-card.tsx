import { Button } from "@/components/ui/button"
import { CheckCircle, XCircle, AlertCircle, ChevronDown } from "lucide-react"
import { useState } from "react"

export interface ActionData {
  action: string
  confidence?: number
  data: Record<string, any>
  missing_required?: string[]
  missing_optional?: string[]
  customer_candidates?: { id: string; nickname: string }[]
  message?: string
}

const ACTION_LABELS: Record<string, string> = {
  create_customer: "新建客户",
  create_visit: "到访记录",
  create_membership_card: "会员卡购买",
  create_group_case: "觉醒游戏",
  create_emotional_release: "情绪释放",
  create_energy_knot: "能量结",
  create_internal_course: "内部课程",
  create_other_project: "其他项目",
}

const FIELD_LABELS: Record<string, string> = {
  nickname: "昵称",
  name: "姓名",
  gender: "性别",
  phone: "电话",
  wechat: "微信",
  visit_date: "到访日期",
  visit_time: "到访时间",
  activity_type: "活动类型",
  needs: "需求",
  card_type: "卡类型",
  price: "价格",
  effective_date: "生效日期",
  purchase_count: "购买次数",
  amount: "金额",
  course_type: "课程类型",
  project_name: "项目名称",
  fee: "费用",
  activity_mode: "活动模式",
  closer_name: "成交人",
  organization_id: "所属组织",
  arrived: "已到场",
  customer_id: "客户ID",
}

interface ActionCardProps {
  actionData: ActionData
  onConfirm: () => void
  onCancel: () => void
  onSelectCustomer: (customerId: string, nickname: string) => void
  loading?: boolean
}

export function ActionCard({ actionData, onConfirm, onCancel, onSelectCustomer, loading }: ActionCardProps) {
  const [showOptional, setShowOptional] = useState(false)
  const label = ACTION_LABELS[actionData.action] || actionData.action
  const hasRequiredMissing = (actionData.missing_required?.length ?? 0) > 0
  const hasOptionalMissing = (actionData.missing_optional?.length ?? 0) > 0
  const hasCandidates = (actionData.customer_candidates?.length ?? 0) > 0

  return (
    <div className="bg-white border border-[#e0e0e0] rounded-lg overflow-hidden mt-1 max-w-[320px]">
      <div className="px-3 py-2 bg-[#f7f8fa] border-b border-[#e0e0e0] flex items-center gap-2">
        <CheckCircle className="h-4 w-4 text-[#3370ff]" />
        <span className="text-[13px] font-medium text-[#2b2f36]">{label}</span>
      </div>

      <div className="px-3 py-2.5 space-y-1.5">
        {Object.entries(actionData.data).map(([key, value]) => {
          if (!value && value !== 0 && value !== true) return null
          const fieldLabel = FIELD_LABELS[key] || key
          const displayValue = value === true ? "是" : value === false ? "否" : String(value)
          return (
            <div key={key} className="flex items-baseline gap-2 text-[12px]">
              <span className="text-[#8f959e] shrink-0 w-16 text-right">{fieldLabel}</span>
              <span className="text-[#2b2f36]">{displayValue}</span>
            </div>
          )
        })}

        {hasCandidates && (
          <div className="pt-1.5 mt-1.5 border-t border-[#f0f0f0]">
            <p className="text-[11px] text-[#8f959e] mb-1.5">匹配到多个客户，请选择：</p>
            <div className="flex flex-wrap gap-1.5">
              {actionData.customer_candidates!.map((c) => (
                <button
                  key={c.id}
                  onClick={() => onSelectCustomer(c.id, c.nickname)}
                  className="px-2.5 py-1 text-[11px] text-[#3370ff] bg-[#f0f5ff] rounded-md hover:bg-[#dbe8ff] transition-colors"
                >
                  {c.nickname}
                </button>
              ))}
            </div>
          </div>
        )}

        {hasRequiredMissing && (
          <div className="flex items-start gap-1.5 pt-1.5 mt-1.5 border-t border-[#f0f0f0]">
            <AlertCircle className="h-3.5 w-3.5 text-[#f54a45] shrink-0 mt-0.5" />
            <p className="text-[11px] text-[#f54a45]">
              缺少必填信息：{actionData.missing_required!.map(f => FIELD_LABELS[f] || f).join("、")}
            </p>
          </div>
        )}

        {hasOptionalMissing && (
          <div className="pt-1.5 mt-1.5 border-t border-[#f0f0f0]">
            <button
              onClick={() => setShowOptional(!showOptional)}
              className="flex items-center gap-1 text-[11px] text-[#8f959e] hover:text-[#2b2f36] transition-colors"
            >
              <ChevronDown className={`h-3 w-3 transition-transform ${showOptional ? "rotate-180" : ""}`} />
              可补充信息（{actionData.missing_optional!.length}项）
            </button>
            {showOptional && (
              <p className="text-[11px] text-[#8f959e] mt-1">
                {actionData.missing_optional!.map(f => FIELD_LABELS[f] || f).join("、")}
              </p>
            )}
          </div>
        )}
      </div>

      {!hasRequiredMissing && !hasCandidates && (
        <div className="px-3 py-2 border-t border-[#e0e0e0] flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={onCancel}
            disabled={loading}
          >
            <XCircle className="h-3 w-3 mr-1" />
            取消
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={onConfirm}
            disabled={loading}
          >
            <CheckCircle className="h-3 w-3 mr-1" />
            {loading ? "录入中..." : "确认录入"}
          </Button>
        </div>
      )}
    </div>
  )
}
