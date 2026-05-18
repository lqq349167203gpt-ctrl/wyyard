import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import type { ActivityRecord } from "@/lib/api"

const TYPE_COLORS: Record<string, string> = {
  "课程": "bg-[#e8f0fe] text-[#3b7aed]",
  "觉醒游戏": "bg-[#eae8fe] text-[#6b5ce7]",
  "情绪释放": "bg-[#fce8ec] text-[#c4506a]",
  "能量结": "bg-[#fff3e0] text-[#c28a32]",
  "内部课程": "bg-[#e6f7f0] text-[#3baa7a]",
}

const ROLE_COLORS: Record<string, string> = {
  "案主": "bg-[#fce8ec] text-[#c4506a]",
  "参与者": "bg-[#e8f0fe] text-[#3b7aed]",
}

export default function ActivityList({ activities }: { activities: ActivityRecord[] }) {
  return (
    <div className="bg-white rounded-lg">
      <div className="px-4 py-3 border-b">
        <h3 className="text-[13px] font-medium text-[#2b2f36]">活动记录</h3>
      </div>
      {activities.length === 0 ? (
        <div className="p-4 text-xs text-[#8f959e] text-center">暂无活动记录</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">日期</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>名称</TableHead>
              <TableHead>角色</TableHead>
              <TableHead>主持人</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activities.map((a, i) => (
              <TableRow key={i}>
                <TableCell className="pl-4 text-[12px] text-[#4e535a]">{a.date}</TableCell>
                <TableCell>
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${TYPE_COLORS[a.type] || "bg-[#f0f1f2] text-[#646a73]"}`}>
                    {a.type}
                  </span>
                </TableCell>
                <TableCell className="text-[12px] text-[#2b2f36]">{a.name || "-"}</TableCell>
                <TableCell>
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${ROLE_COLORS[a.role] || "bg-[#f0f1f2] text-[#646a73]"}`}>
                    {a.role}
                  </span>
                </TableCell>
                <TableCell className="text-[12px] text-[#4e535a]">{a.host || "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
