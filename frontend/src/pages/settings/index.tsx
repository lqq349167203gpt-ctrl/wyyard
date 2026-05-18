import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

export default function SettingsPage() {
  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-lg font-semibold">系统设置</h1>
        <p className="text-xs text-muted-foreground mt-0.5">API 密钥、模型配置和数据源</p>
      </div>

      <Card className="shadow-none">
        <CardHeader className="px-5 pt-4 pb-3 border-b">
          <CardTitle className="text-sm font-semibold">AI 模型配置</CardTitle>
        </CardHeader>
        <CardContent className="px-5 py-5 space-y-4">
          <div className="grid grid-cols-[100px_1fr] items-center gap-3">
            <Label className="text-sm text-muted-foreground text-right">API Key</Label>
            <Input type="password" placeholder="sk-ant-..." />
          </div>
          <div className="grid grid-cols-[100px_1fr] items-center gap-3">
            <Label className="text-sm text-muted-foreground text-right">默认模型</Label>
            <Input defaultValue="claude-sonnet-4-6" />
          </div>
          <div className="flex justify-end pt-2 border-t">
            <Button size="sm">保存</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader className="px-5 pt-4 pb-3 border-b">
          <CardTitle className="text-sm font-semibold">飞书应用配置</CardTitle>
        </CardHeader>
        <CardContent className="px-5 py-5 space-y-4">
          <div className="grid grid-cols-[100px_1fr] items-center gap-3">
            <Label className="text-sm text-muted-foreground text-right">App ID</Label>
            <Input placeholder="cli_xxx" />
          </div>
          <div className="grid grid-cols-[100px_1fr] items-center gap-3">
            <Label className="text-sm text-muted-foreground text-right">App Secret</Label>
            <Input type="password" placeholder="飞书应用密钥" />
          </div>
          <div className="flex justify-end pt-2 border-t">
            <Button size="sm">保存</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
