import type { NextFollowUpPlan } from "@/lib/api"

export function followUpPlanText(plan: NextFollowUpPlan): string {
  return [plan.next_follow_up_person, (plan.next_follow_up_date || "").replace(/^\d{4}-(\d{2})-(\d{2})$/, "$1/$2")].filter(Boolean).join(" ")
}

/** 署名与跟进安排共用两行布局；未配置安排时不占空行。 */
export function NoteFeedbackMeta({ author, plan = {}, inline = false }: { author: string; plan?: NextFollowUpPlan; inline?: boolean }) {
  const next = followUpPlanText(plan)
  return <span className="block min-w-0 font-normal text-[#2b2f36]">
    <span className={inline ? "inline" : "block"}><span className="text-[#a4abb4]">反馈：</span>{author || "未知"}</span>
    {next && <span className={inline ? "ml-2 inline" : "block"}><span className="text-[#a4abb4]">下次跟进：</span>{next}</span>}
  </span>
}
