import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders the building code gate before login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ profile: null, authState: 'anonymous', residentIdentity: null }),
      }),
    )

    render(<App />)
    expect(await screen.findByText('科技生态园1C栋')).toBeInTheDocument()
    expect(screen.getByText('请输入楼栋邀请码')).toBeInTheDocument()
  })
})
