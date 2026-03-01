import { expect, test, type Page } from '@playwright/test'

async function signup(page: Page, email: string, password = '123456') {
  await page.goto('/signup')

  await page.getByLabel('이메일').fill(email)
  await page.getByLabel('이름').fill('테스터')
  await page.getByLabel('전화번호').fill('01012345678')
  await page.getByLabel('계좌번호 (선택)').fill('123-456-7890')
  await page.getByLabel('비밀번호').fill(password)
  await page.getByRole('button', { name: '가입 완료' }).click()

  await expect(page).toHaveURL(/\/g\/.+\/meetings|\/groups/)
}

async function login(page: Page, email: string, password = '123456') {
  await page.goto('/login')
  await page.getByLabel('이메일').fill(email)
  await page.getByLabel('비밀번호').fill(password)
  await page.getByRole('button', { name: '로그인' }).click()
  await expect(page).toHaveURL(/\/g\/.+\/meetings|\/groups/)
}

async function ensureSeedMembers(page: Page) {
  await page.evaluate(() => {
    const STORAGE_KEY = 'zoc9-data-v1'
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return
    }

    const data = JSON.parse(raw) as {
      groups: Array<{ id: string }>
      profiles: Array<{ id: string; email: string; name: string; phone: string }>
      groupMembers: Array<{
        id: string
        groupId: string
        profileId: string
        role: 'owner' | 'admin' | 'member'
        permissions: string[]
        permissionsOverride?: boolean
      }>
    }

    const groupId = data.groups[0]?.id
    if (!groupId) {
      return
    }

    const members = [
      { id: 'seed-p2', email: 'seed2@example.com', name: '시드2', phone: '01000000002' },
      { id: 'seed-p3', email: 'seed3@example.com', name: '시드3', phone: '01000000003' },
      { id: 'seed-p4', email: 'seed4@example.com', name: '시드4', phone: '01000000004' },
      { id: 'seed-p5', email: 'seed5@example.com', name: '시드5', phone: '01000000005' },
    ]

    for (const member of members) {
      if (!data.profiles.some((profile) => profile.id === member.id)) {
        data.profiles.push({ ...member })
      }

      if (!data.groupMembers.some((groupMember) => groupMember.profileId === member.id && groupMember.groupId === groupId)) {
        data.groupMembers.push({
          id: `seed-gm-${member.id}`,
          groupId,
          profileId: member.id,
          role: 'member',
          permissions: [],
          permissionsOverride: false,
        })
      }
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  })

  await page.reload()
  await expect(page).toHaveURL(/\/g\/.+\/meetings/)
}

async function createMeetingAndEnter(page: Page, title: string) {
  await page.getByLabel('모임 이름').fill(title)
  await page.getByRole('button', { name: '모임 생성' }).click()

  await expect(page.getByText(title)).toBeVisible()

  await page.getByRole('button', { name: '모임 시작' }).first().click()
  await page.getByRole('button', { name: '모임 입장' }).first().click()
  await expect(page).toHaveURL(/\/matches$/)
}

async function createMatch(page: Page, options?: { deuce?: boolean }) {
  const deuceEnabled = options?.deuce ?? true

  await page.getByRole('button', { name: '인원 구성' }).click()
  await page.getByRole('button', { name: '2 vs 2' }).click()
  await page.getByLabel('목표 점수').fill('5')

  const teamAButtons = page.getByTestId('team-a-capsules').locator('button[data-member-id]')
  const teamBButtons = page.getByTestId('team-b-capsules').locator('button[data-member-id]')

  await teamAButtons.nth(0).click()
  await teamAButtons.nth(1).click()
  await teamBButtons.nth(2).click()
  await teamBButtons.nth(3).click()

  await page.getByRole('button', { name: '심판 (선택)' }).click()
  await page.getByRole('dialog').getByRole('button', { name: '시드5' }).click()
  await expect(page.getByTestId('team-a-capsules').getByRole('button', { name: /시드5/ })).toBeDisabled()
  await expect(page.getByTestId('team-b-capsules').getByRole('button', { name: /시드5/ })).toBeDisabled()

  const deuceSwitch = page.getByRole('switch', { name: '듀스 적용' })
  if (!deuceEnabled) {
    await deuceSwitch.click()
    await expect(deuceSwitch).toHaveAttribute('aria-checked', 'false')
    await expect(page.getByText('현재: 미적용')).toBeVisible()
  } else {
    await expect(deuceSwitch).toHaveAttribute('aria-checked', 'true')
  }

  await page.getByRole('button', { name: '매치 생성' }).click()
  await expect(page.getByText('세트 1')).toBeVisible()
}

async function winCurrentSetWithTeamA(page: Page) {
  const startButton = page.getByRole('button', { name: '세트 시작' })
  if (await startButton.isVisible()) {
    await startButton.click()
  }

  const readonlyNotice = page.getByText('완료된 기록은 기본 수정 불가입니다.')
  const scoreButton = page.getByRole('button', { name: /A팀 \+1/ })
  for (let i = 0; i < 12; i += 1) {
    if (await readonlyNotice.isVisible()) {
      break
    }

    if (!(await scoreButton.isEnabled())) {
      await page.waitForTimeout(120)
      continue
    }

    const clicked = await scoreButton.evaluate((button) => {
      const htmlButton = button as HTMLButtonElement
      if (htmlButton.disabled) {
        return false
      }

      htmlButton.click()
      return true
    })

    if (!clicked) {
      await page.waitForTimeout(120)
    }
  }

  await expect(readonlyNotice).toBeVisible()
}

test('회원가입 → 로그인 → 그룹입장', async ({ page }) => {
  const suffix = Date.now()
  const email = `zoc9-${suffix}@example.com`

  await signup(page, email)

  await page.getByRole('button', { name: '로그아웃' }).click()
  await expect(page).toHaveURL(/\/login/)

  await login(page, email)
})

test('모임 생성 → 진행중 전환 → 매치 생성', async ({ page }) => {
  const suffix = Date.now()
  await signup(page, `ops-${suffix}@example.com`)
  await ensureSeedMembers(page)

  await createMeetingAndEnter(page, `E2E 모임 ${suffix}`)
  await createMatch(page, { deuce: false })
  await page.getByText('세트 1').first().click()
  await expect(page.getByText('목표 5점 · 듀스 미적용')).toBeVisible()
})

test('세트 라이브 기록 → 매치 조기종료 → 잔여세트 ignored → 읽기전용', async ({ page }) => {
  const suffix = Date.now()
  await signup(page, `live-${suffix}@example.com`)
  await ensureSeedMembers(page)

  await createMeetingAndEnter(page, `라이브 모임 ${suffix}`)
  await createMatch(page)

  await page.getByText('세트 1').first().click()
  await winCurrentSetWithTeamA(page)
  await page.goBack()
  const set1Card = page.locator('a').filter({ hasText: '세트 1' }).first()
  await expect(set1Card.getByText('완료')).toBeVisible()

  await page.getByText('세트 2').first().click()
  await winCurrentSetWithTeamA(page)
  await page.goBack()
  const set2Card = page.locator('a').filter({ hasText: '세트 2' }).first()
  await expect(set2Card.getByText('완료')).toBeVisible()

  await expect(page.getByText('무시됨')).toBeVisible()

  await page.getByText('세트 3').first().click()
  await expect(page.getByText('완료된 기록은 기본 수정 불가입니다.')).toBeVisible()
})

test('오프라인 득점 기록 후 복귀 동기화', async ({ page }) => {
  const suffix = Date.now()
  await signup(page, `offline-${suffix}@example.com`)
  await ensureSeedMembers(page)

  await createMeetingAndEnter(page, `오프라인 모임 ${suffix}`)
  await createMatch(page)
  await page.getByRole('link', { name: /세트 1/ }).first().click()
  await expect(page.getByRole('heading', { name: /세트 1 라이브/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /A팀 \+1/ })).toBeVisible()

  await page.context().setOffline(true)
  await expect
    .poll(async () => page.evaluate(() => navigator.onLine), {
      timeout: 5000,
    })
    .toBeFalsy()
  await page.getByRole('button', { name: /A팀 \+1/ }).click()
  await expect(page.getByText('A팀 득점')).toBeVisible()
  await expect(page.getByText(/오프라인 큐:/)).toBeVisible()

  await page.context().setOffline(false)
  await expect
    .poll(async () => page.evaluate(() => navigator.onLine), {
      timeout: 5000,
    })
    .toBeTruthy()
  await expect
    .poll(async () => (await page.getByText(/오프라인 큐:/).first().textContent()) ?? '', {
      timeout: 10000,
    })
    .toContain('0건')
})

test('그룹 홈 매치 탭에서 진행중 모임 바로가기', async ({ page }) => {
  const suffix = Date.now()
  await signup(page, `hub-${suffix}@example.com`)

  await page.getByRole('button', { name: '모임 시작' }).first().click()
  await page.getByRole('link', { name: '매치' }).click()

  await expect(page.getByRole('button', { name: '진행중 모임 매치로 이동' })).toBeVisible()
  await page.getByRole('button', { name: '진행중 모임 매치로 이동' }).click()
  await expect(page).toHaveURL(/\/matches$/)
})
