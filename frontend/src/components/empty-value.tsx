/** 列表空值占位：与客户资料页一致的极淡极短圆角横线。 */
export function EmptyValue({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-[2px] w-[4px] shrink-0 rounded-full bg-[#e5e8eb] align-middle ${className}`}
      aria-label="无内容"
    />
  )
}
