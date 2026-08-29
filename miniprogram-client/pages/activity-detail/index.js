const { clientApi, resolveResourceUrl, cacheImage } = require('../../utils/api')

Page({
  data: {
    loading: true,
    activity: null,
    signingUp: false,
    signedUp: false,
    activityId: '',
    statusBarHeight: 20,
    navBarHeight: 44,
    navTotalHeight: 64,
    posterHeroStyle: '',
    currentPosterIndex: 0,
    currentPosterImage: '',
    posterSlides: [],
    posterSizes: [],
    carouselHeroHeight: 660,
  },

  onLoad(options) {
    this.setupNavigationBar()
    if (options.id) {
      this.setData({ activityId: options.id })
      this.loadActivity(options.id)
    }
  },

  setupNavigationBar() {
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const menuButton = wx.getMenuButtonBoundingClientRect()
    const statusBarHeight = windowInfo.statusBarHeight || 20
    const navBarHeight = menuButton.height
      ? (menuButton.top - statusBarHeight) * 2 + menuButton.height
      : 44

    this.setData({
      statusBarHeight,
      navBarHeight,
      navTotalHeight: statusBarHeight + navBarHeight,
    })
  },

  onBack() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack()
      return
    }
    wx.switchTab({ url: '/pages/home/index' })
  },

  loadActivity(id) {
    this.setData({
      loading: true,
      posterHeroStyle: '',
      currentPosterIndex: 0,
      currentPosterImage: '',
      posterSlides: [],
      posterSizes: [],
      carouselHeroHeight: 660,
    })
    clientApi.getActivity(id)
      .then(res => {
        const activity = this._decorate(res)
        this.setData({
          activity,
          loading: false,
          signedUp: !!res.signed_up,
          currentPosterImage: activity.previewImages[0] || '',
          posterSlides: activity.previewImages.map(url => ({
            url,
            imageStyle: 'width: 496rpx; height: 660rpx;',
            mode: 'aspectFit',
          })),
        })
        if (activity.previewImages.length) {
          Promise.all(activity.previewImages.map(cacheImage)).then(cachedImages => {
            if (this.data.activity?.id === activity.id) {
              const previewImages = cachedImages.map((url, index) => url || activity.previewImages[index])
              const posterSlides = previewImages.map((url, index) => ({
                url,
                imageStyle: this.data.posterSlides[index]?.imageStyle || 'width: 496rpx; height: 660rpx;',
                mode: this.data.posterSlides[index]?.mode || 'aspectFit',
              }))
              this.setData({
                'activity.posterImage': previewImages[0] || activity.posterImage,
                'activity.previewImages': previewImages,
                currentPosterImage: previewImages[this.data.currentPosterIndex] || previewImages[0] || '',
                posterSlides,
              })
            }
          })
        }
      })
      .catch(() => {
        this.setData({ loading: false })
        wx.showToast({ title: '活动不存在', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 1500)
      })
  },

  // 预处理：老师头像、地址(仅空间)、参与者一行、日期/时间格式化
  _decorate(a) {
    const names = a.teacher_names || []
    const teachers = names.map(n => ({ name: n, initial: (n || '').slice(0, 1) }))
    const parts = (a.date || '').split('-')
    const dateLabel = parts.length === 3
      ? `${Number(parts[1])}月${Number(parts[2])}日`
      : (a.date || '日期待定')
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    const d = new Date((a.date || '').replace(/-/g, '/'))
    const weekday = isNaN(d.getTime()) ? '' : days[d.getDay()]
    const roster = this._buildRoster(a.participants || [])
    // 判断活动状态
    let expiredStatus = ''
    if (a.date && a.start_time) {
      const now = new Date()
      const actStart = new Date(`${a.date}T${a.start_time}:00`)
      if (!isNaN(actStart.getTime())) {
        if (a.end_time) {
          const actEnd = new Date(`${a.date}T${a.end_time}:00`)
          if (!isNaN(actEnd.getTime()) && now >= actEnd) {
            expiredStatus = 'ended'
          }
        }
        if (!expiredStatus && now >= actStart) {
          expiredStatus = 'ongoing'
        }
      }
    }
    // 描述拆段：连续换行视为段落分隔，每段渲染独立 view 加间距
    const desc = (a.description || '').replace(/\r\n/g, '\n')
    const descParagraphs = desc.split(/\n/).filter(p => p.trim()).map(p => ({ text: p.trim() }))

    // 海报图：从活动类型 list_image 获取，拼完整 URL
    const posterImage = resolveResourceUrl(a.list_image)
    const detailImages = (Array.isArray(a.detail_images) ? a.detail_images : [])
      .map(resolveResourceUrl)
      .filter(Boolean)
    const previewImages = detailImages.length
      ? [...new Set(detailImages)]
      : [posterImage].filter(Boolean)

    // 时长文本：如 "约 1 小时"
    let durationText = ''
    if (a.start_time && a.end_time) {
      const [sh, sm] = a.start_time.split(':').map(Number)
      const [eh, em] = a.end_time.split(':').map(Number)
      const diffMin = (eh * 60 + em) - (sh * 60 + sm)
      if (diffMin > 0) {
        if (diffMin < 60) {
          durationText = `约 ${diffMin} 分钟`
        } else {
          const h = Math.floor(diffMin / 60)
          const m = diffMin % 60
          durationText = m ? `约 ${h} 小时 ${m} 分钟` : `约 ${h} 小时`
        }
      }
    }
    const deductionSessions = Math.max(0, Number(a.membership_deduction_count) || 0)
    const participationLocked = !!a.participation_locked

    return {
      ...a,
      isOnline: a.activity_mode === '线上',
      isExpired: !!expiredStatus,
      expiredStatus,
      teachers,
      teacherText: names.join('、'),
      leaderRoleLabel: a.leader_role_label || '老师',
      ownerText: a.owner_name || '',
      addressText: a.space_name || '',
      dateLabel,
      weekday,
      timeStart: a.start_time || '',
      timeEnd: a.end_time || '',
      rosterList: roster,
      rosterCount: roster.length,
      descParagraphs,
      posterImage: previewImages[0] || posterImage,
      detailImages,
      previewImages,
      durationText,
      deductionSessions,
      showDeductionNotice: deductionSessions > 0 && !participationLocked && !a.withdrawn,
      participationLocked,
      participationRoleLabel: a.participation_role_label || '',
    }
  },

  // 参与者名单:自己排最前,全部列出
  _buildRoster(participants) {
    if (!participants.length) return []
    return participants
      .map(p => ({ name: p.nickname || '匿名', is_me: !!p.is_me }))
      .sort((a, b) => (b.is_me ? 1 : 0) - (a.is_me ? 1 : 0))
  },

  onPreviewPoster(e) {
    const activity = this.data.activity
    const urls = activity?.previewImages || []
    if (!urls.length) return
    const requestedIndex = Number(e.currentTarget?.dataset?.index)
    const currentIndex = Number.isInteger(requestedIndex) ? requestedIndex : this.data.currentPosterIndex

    wx.previewImage({
      current: urls[currentIndex] || urls[0],
      urls,
    })
  },

  _calculateHeroHeight(width, height) {
    const ratio = width / height
    if (ratio >= 0.75) return 660

    const posterWidth = 525
    const maxHeroHeight = 940
    return Math.min(Math.round(posterWidth / ratio), maxHeroHeight)
  },

  _buildSlideLayout(width, height, heroHeight) {
    const ratio = width / height
    if (ratio >= 0.75) {
      return {
        imageStyle: `width: 496rpx; height: ${heroHeight}rpx;`,
        mode: 'aspectFit',
      }
    }

    const posterWidth = 525
    const naturalHeight = posterWidth / ratio
    return {
      imageStyle: `width: ${posterWidth}rpx; height: ${heroHeight}rpx;`,
      mode: naturalHeight > heroHeight ? 'aspectFill' : 'aspectFit',
    }
  },

  onPosterLoad(e) {
    const width = Number(e.detail?.width)
    const height = Number(e.detail?.height)
    if (!width || !height) return

    const index = Number(e.currentTarget?.dataset?.index) || 0
    const posterSizes = [...this.data.posterSizes]
    posterSizes[index] = { width, height }

    // 轮播区高度只由第一张图决定，切换不同长宽比图片时不再引起整页位移。
    const carouselHeroHeight = index === 0
      ? this._calculateHeroHeight(width, height)
      : this.data.carouselHeroHeight
    const posterSlides = this.data.posterSlides.map((slide, slideIndex) => {
      const size = posterSizes[slideIndex]
      if (!size) return slide
      return {
        ...slide,
        ...this._buildSlideLayout(size.width, size.height, carouselHeroHeight),
      }
    })

    this.setData({
      posterSizes,
      posterSlides,
      carouselHeroHeight,
      posterHeroStyle: carouselHeroHeight === 660 ? '' : `height: ${carouselHeroHeight}rpx;`,
    })
  },

  onPosterChange(e) {
    const currentPosterIndex = Number(e.detail?.current) || 0
    this.setData({
      currentPosterIndex,
      currentPosterImage: this.data.posterSlides[currentPosterIndex]?.url
        || this.data.activity?.previewImages?.[currentPosterIndex]
        || '',
    })
  },

  onSignup() {
    const app = getApp()
    if (!app.isLoggedIn()) {
      const url = `/pages/activity-detail/index?id=${this.data.activityId}`
      wx.navigateTo({ url: `/pages/login/index?redirect=${encodeURIComponent(url)}` })
      return
    }

    if (this.data.activity?.participationLocked) {
      const roleLabel = this.data.activity.participationRoleLabel || '固定参与人员'
      wx.showToast({ title: `${roleLabel}已自动参与，无需报名`, icon: 'none' })
      return
    }

    if (this.data.signingUp || this.data.signedUp) return

    this.setData({ signingUp: true })
    clientApi.signup(this.data.activity.id)
      .then(() => {
        this.setData({ signedUp: true, signingUp: false })
        wx.showToast({ title: '报名成功', icon: 'success' })
        this.loadActivity(this.data.activity.id)
      })
      .catch(err => {
        this.setData({ signingUp: false })
        if (err.message === '已报名该活动') {
          this.setData({ signedUp: true })
        }
      })
  },

  onCancelSignup() {
    if (this.data.activity?.participationLocked) {
      const roleLabel = this.data.activity.participationRoleLabel || '固定参与人员'
      wx.showToast({ title: `${roleLabel}无法取消参与`, icon: 'none' })
      return
    }

    wx.showModal({
      title: '提示',
      content: '确定要取消报名吗？',
      success: (res) => {
        if (res.confirm) {
          clientApi.cancelSignup(this.data.activity.id)
            .then(() => {
              this.setData({ signedUp: false })
              wx.showToast({ title: '已取消报名', icon: 'success' })
              this.loadActivity(this.data.activity.id)
            })
            .catch(err => {
              wx.showToast({ title: err.message || '取消失败', icon: 'none' })
            })
        }
      },
    })
  },
})
