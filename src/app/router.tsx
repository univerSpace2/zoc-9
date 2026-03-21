/* eslint-disable react-refresh/only-export-components */
import { createBrowserRouter } from 'react-router-dom'
import { AuthedLayout } from '@/app/layouts/AuthedLayout'
import { GroupLayout } from '@/app/layouts/GroupLayout'
import { MeetingLayout } from '@/app/layouts/MeetingLayout'
import { PublicLayout } from '@/app/layouts/PublicLayout'
import { RequireAuth } from '@/app/layouts/RequireAuth'
import { RootLayout } from '@/app/layouts/RootLayout'
import { InvitePage } from '@/features/auth/pages/InvitePage'
import { LandingPage } from '@/features/auth/pages/LandingPage'
import { LoginPage } from '@/features/auth/pages/LoginPage'
import { SignupPage } from '@/features/auth/pages/SignupPage'
import { GroupMatchHubPage } from '@/features/groups/pages/GroupMatchHubPage'
import { GroupMeetingsPage } from '@/features/groups/pages/GroupMeetingsPage'
import { GroupMembersPage } from '@/features/groups/pages/GroupMembersPage'
import { GroupMorePage } from '@/features/groups/pages/GroupMorePage'
import { GroupSettingsPage } from '@/features/groups/pages/GroupSettingsPage'
import { GroupVenuesPage } from '@/features/groups/pages/GroupVenuesPage'
import { GroupNoticesPage } from '@/features/groups/pages/GroupNoticesPage'
import { GroupInvitesPage } from '@/features/groups/pages/GroupInvitesPage'
import { GroupPermissionsPage } from '@/features/groups/pages/GroupPermissionsPage'
import { GroupTransferPage } from '@/features/groups/pages/GroupTransferPage'
import { GroupAuditPage } from '@/features/groups/pages/GroupAuditPage'
import { GroupSelectPage } from '@/features/groups/pages/GroupSelectPage'
import { MeetingInfoPage } from '@/features/meetings/pages/MeetingInfoPage'
import { MeetingMatchesPage } from '@/features/meetings/pages/MeetingMatchesPage'
import { MeetingStatsPage } from '@/features/meetings/pages/MeetingStatsPage'
import { SetLivePage } from '@/features/meetings/pages/SetLivePage'
import { ProfilePage } from '@/features/profile/pages/ProfilePage'

function NotFoundPage() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center px-4 text-center text-surface-700">
      요청한 페이지를 찾을 수 없습니다.
    </div>
  )
}

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      {
        element: <PublicLayout />,
        children: [
          {
            path: '/',
            element: <LandingPage />,
          },
          {
            path: '/login',
            element: <LoginPage />,
          },
          {
            path: '/signup',
            element: <SignupPage />,
          },
          {
            path: '/invite/:token',
            element: <InvitePage />,
          },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AuthedLayout />,
            children: [
              {
                path: '/groups',
                element: <GroupSelectPage />,
              },
              {
                path: '/profile',
                element: <ProfilePage />,
              },
            ],
          },
          {
            path: '/g/:groupId',
            element: <GroupLayout />,
            children: [
              {
                path: 'meetings',
                element: <GroupMeetingsPage />,
              },
              {
                path: 'match',
                element: <GroupMatchHubPage />,
              },
              {
                path: 'members',
                element: <GroupMembersPage />,
              },
              {
                path: 'more',
                children: [
                  { index: true, element: <GroupMorePage /> },
                  { path: 'settings', element: <GroupSettingsPage /> },
                  { path: 'venues', element: <GroupVenuesPage /> },
                  { path: 'notices', element: <GroupNoticesPage /> },
                  { path: 'invites', element: <GroupInvitesPage /> },
                  { path: 'permissions', element: <GroupPermissionsPage /> },
                  { path: 'transfer', element: <GroupTransferPage /> },
                  { path: 'audit', element: <GroupAuditPage /> },
                ],
              },
            ],
          },
          {
            path: '/g/:groupId/m/:meetingId',
            element: <MeetingLayout />,
            children: [
              {
                path: 'matches',
                element: <MeetingMatchesPage />,
              },
              {
                path: 'stats',
                element: <MeetingStatsPage />,
              },
              {
                path: 'info',
                element: <MeetingInfoPage />,
              },
              {
                path: 'match/:matchId/set/:setId/live',
                element: <SetLivePage />,
              },
            ],
          },
        ],
      },
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
])
