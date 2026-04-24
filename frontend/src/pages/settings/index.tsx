import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">系统设置</h1>
        <p className="text-sm text-muted-foreground mt-1">API 密钥、模型配置和数据源</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI 模型配置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Anthropic API Key</Label>
            <Input type="password" placeholder="sk-ant-..." />
          </div>
          <div className="space-y-2">
            <Label>默认模型</Label>
            <Input defaultValue="claude-sonnet-4-6" />
          </div>
          <Button>保存模型配置</Button>
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">飞书应用配置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>App ID</Label>
            <Input placeholder="cli_xxx" />
          </div>
          <div className="space-y-2">
            <Label>App Secret</Label>
            <Input type="password" placeholder="飞书应用密钥" />
          </div>
          <Button>保存飞书配置</Button>
        </CardContent>
      </Card>
    </div>
  )
}
