// 风格预览页面逻辑
Page({
  data: {
    selectedStyle: 1,
    styles: [
      {
        id: 1,
        name: '现代卡片式',
        description: '清晰的卡片层次、圆角设计、微妙的阴影效果',
        color: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
        background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
        dateHeaderBg: 'transparent',
        dateHeaderColor: '#1e293b',
        cardBg: '#ffffff',
        cardRadius: '20rpx',
        cardShadow: '0 4rpx 20rpx rgba(0, 0, 0, 0.06)',
        cardPadding: '32rpx',
        showImage: false,
        imageBg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        textColor: '#1e293b',
        titleSize: '32rpx',
        tagOnlineBg: 'linear-gradient(135deg, #dbeafe, #bfdbfe)',
        tagOnlineColor: '#1d4ed8',
        tagWelfareBg: 'linear-gradient(135deg, #fef3c7, #fde68a)',
        tagWelfareColor: '#d97706',
        labelColor: '#64748b',
        descColor: '#64748b',
        descBorder: '1rpx solid #f1f5f9',
        fullDescription: '现代卡片式设计采用清晰的卡片层次结构，每个活动卡片都有明显的边界和圆角设计。使用微妙的阴影效果创造深度感，让界面看起来更加立体和现代。色彩以蓝色和紫色为主，营造专业而富有活力的视觉效果。'
      },
      {
        id: 2,
        name: '简约列表式',
        description: '简洁的线条分隔、清晰的排版、高效的空间利用',
        color: 'linear-gradient(135deg, #10b981, #3b82f6)',
        background: '#ffffff',
        dateHeaderBg: '#f8f9fa',
        dateHeaderColor: '#2b2f36',
        cardBg: '#ffffff',
        cardRadius: '0',
        cardShadow: 'none',
        cardPadding: '28rpx 32rpx',
        showImage: false,
        imageBg: '#f0f0f0',
        textColor: '#2b2f36',
        titleSize: '30rpx',
        tagOnlineBg: '#e8f3ff',
        tagOnlineColor: '#3370ff',
        tagWelfareBg: '#fff2e8',
        tagWelfareColor: '#f5a623',
        labelColor: '#8f959e',
        descColor: '#8f959e',
        descBorder: '1rpx solid #f5f5f5',
        fullDescription: '简约列表式设计追求极致的简洁和高效。使用细线条分隔不同活动，去除多余的装饰元素，让信息更加突出。日期分组使用粘性定位，方便用户快速定位。整体设计干净利落，适合信息密度较高的场景。'
      },
      {
        id: 3,
        name: '时间轴式',
        description: '垂直时间线连接活动、突出时间顺序、活动流程清晰',
        color: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
        background: '#f8fafc',
        dateHeaderBg: 'transparent',
        dateHeaderColor: '#1e293b',
        cardBg: '#ffffff',
        cardRadius: '16rpx',
        cardShadow: '0 2rpx 12rpx rgba(0, 0, 0, 0.06)',
        cardPadding: '28rpx 32rpx',
        showImage: false,
        imageBg: '#f0f0f0',
        textColor: '#1e293b',
        titleSize: '30rpx',
        tagOnlineBg: 'linear-gradient(135deg, #dbeafe, #bfdbfe)',
        tagOnlineColor: '#1d4ed8',
        tagWelfareBg: 'linear-gradient(135deg, #fef3c7, #fde68a)',
        tagWelfareColor: '#d97706',
        labelColor: '#64748b',
        descColor: '#64748b',
        descBorder: '1rpx solid #f1f5f9',
        fullDescription: '时间轴式设计通过垂直的时间线将各个活动连接起来，形成清晰的时间脉络。每个活动卡片都有连接点和连接线，突出时间顺序和活动流程。色彩从蓝色渐变到紫色再到粉色，象征时间的流动。适合展示有时间序列的活动安排。'
      },
      {
        id: 4,
        name: '杂志式',
        description: '大胆的排版、图片占位、编辑式布局、视觉吸引力强',
        color: 'linear-gradient(135deg, #ff6b6b, #ffd166)',
        background: '#ffffff',
        dateHeaderBg: '#2b2f36',
        dateHeaderColor: '#ffffff',
        cardBg: '#ffffff',
        cardRadius: '0',
        cardShadow: 'none',
        cardPadding: '32rpx 40rpx',
        showImage: true,
        imageBg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        textColor: '#2b2f36',
        titleSize: '36rpx',
        tagOnlineBg: '#2b2f36',
        tagOnlineColor: '#ffffff',
        tagWelfareBg: '#ff6b6b',
        tagWelfareColor: '#ffffff',
        labelColor: '#8f959e',
        descColor: '#5f6672',
        descBorder: '2rpx solid #2b2f36',
        fullDescription: '杂志式设计采用大胆的排版和编辑式布局，每个活动都有图片占位区域，增强视觉吸引力。日期分组使用深色背景和彩色装饰线，营造杂志封面的感觉。标签使用大写字母和对比色，更加醒目。适合需要强烈视觉冲击力的场景。'
      }
    ],
    currentStyle: {}
  },

  onLoad() {
    this.updateCurrentStyle()
  },

  // 选择风格
  selectStyle(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ selectedStyle: id })
    this.updateCurrentStyle()
  },

  // 更新当前风格
  updateCurrentStyle() {
    const style = this.data.styles.find(s => s.id === this.data.selectedStyle)
    this.setData({ currentStyle: style })
  },

  // 应用风格
  applyStyle() {
    const styleId = this.data.selectedStyle
    wx.showModal({
      title: '应用风格',
      content: `确定要应用"${this.data.currentStyle.name}"风格吗？`,
      success: (res) => {
        if (res.confirm) {
          // 这里可以保存用户选择的风格到本地存储
          wx.setStorageSync('selectedStyle', styleId)
          wx.showToast({
            title: '风格已应用',
            icon: 'success'
          })
        }
      }
    })
  },

  // 重置为默认
  resetStyle() {
    wx.showModal({
      title: '重置风格',
      content: '确定要重置为默认风格吗？',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('selectedStyle')
          this.setData({ selectedStyle: 1 })
          this.updateCurrentStyle()
          wx.showToast({
            title: '已重置为默认',
            icon: 'success'
          })
        }
      }
    })
  }
})