import { useState } from "react"
import { Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SelectDropdown } from "@/components/select-dropdown"
import { customerTagApi, type CustomerTag } from "@/lib/api"

interface CustomerTagFieldProps {
  tags: CustomerTag[]
  value: string[]
  onChange: (tagIds: string[]) => void
  onTagCreated: (tag: CustomerTag) => void
  disabled?: boolean
  loading?: boolean
}

export function CustomerTagField({ tags, value, onChange, onTagCreated, disabled = false, loading = false }: CustomerTagFieldProps) {
  const [creatingOpen, setCreatingOpen] = useState(false)
  const [quickName, setQuickName] = useState("")
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState("")

  const createPrivate = async () => {
    const name = quickName.trim()
    if (!name) return
    setCreating(true)
    setError("")
    try {
      const tag = await customerTagApi.create({ name, scope: "private", description: "" })
      onTagCreated(tag)
      onChange([...value, tag.id])
      setQuickName("")
      setCreatingOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "新建标签失败")
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex basis-full items-start gap-2">
      <label className="mt-2 w-12 flex-shrink-0 text-right text-[12px] font-normal text-[#4e535a]">客户标签</label>
      <div className="flex min-w-0 flex-1 flex-wrap items-start gap-2 pr-[96px]">
        <SelectDropdown
          multi
          value={value}
          options={tags.map(tag => ({
            value: tag.id,
            label: tag.scope === "private" ? `${tag.name} · 我的` : tag.name,
          }))}
          onChange={onChange}
          placeholder={loading ? "标签加载中..." : disabled ? "标签加载失败" : "请选择标签"}
          disabled={disabled}
          clearable
          className="w-[240px]"
          rounded="4px"
        />
        {!creatingOpen ? (
          <Button type="button" variant="outline" size="sm" className="h-8 text-[12px]" onClick={() => setCreatingOpen(true)} disabled={disabled}>
            <Plus className="mr-1 h-3.5 w-3.5" />新建我的标签
          </Button>
        ) : (
          <div className="flex items-center gap-1.5">
            <Input
              value={quickName}
              maxLength={30}
              onChange={event => { setQuickName(event.target.value); setError("") }}
              onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); createPrivate() } }}
              placeholder="标签名称（仅自己可见）"
              className="w-[190px]"
            />
            <Button type="button" size="sm" className="h-8 text-[12px]" onClick={createPrivate} disabled={creating || !quickName.trim()}>
              {creating ? "新增中" : "新增"}
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 text-[#8f959e]" onClick={() => { setCreatingOpen(false); setQuickName(""); setError("") }} aria-label="取消新建标签">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
        {error && <span className="basis-full text-[12px] text-[#c4506a]">{error}</span>}
      </div>
    </div>
  )
}
