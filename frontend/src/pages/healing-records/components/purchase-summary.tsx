import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import type { PurchaseSummaryItem } from "@/lib/api"

export default function PurchaseSummary({ items }: { items: PurchaseSummaryItem[] }) {
  return (
    <div className="bg-white rounded-lg">
      <div className="px-4 py-3 border-b">
        <h3 className="text-[13px] font-medium text-[#2b2f36]">购买汇总</h3>
      </div>
      {items.length === 0 ? (
        <div className="p-4 text-xs text-[#8f959e] text-center">暂无购买记录</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">类型</TableHead>
              <TableHead>总购买</TableHead>
              <TableHead>已用</TableHead>
              <TableHead>剩余</TableHead>
              <TableHead>总金额</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, i) => (
              <TableRow key={i}>
                <TableCell className="pl-4 text-[12px] text-[#2b2f36] font-medium">{item.type}</TableCell>
                <TableCell className="text-[12px] text-[#4e535a]">{item.total_purchased}</TableCell>
                <TableCell className="text-[12px] text-[#4e535a]">{item.used}</TableCell>
                <TableCell className="text-[12px] text-[#4e535a]">{item.remaining}</TableCell>
                <TableCell className="text-[12px] text-[#4e535a]">¥{item.total_amount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
