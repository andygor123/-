import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders the entry gate copy for mainland WeChat H5 users', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ profile: null }),
      }),
    )

    render(<App />)
    expect(await screen.findByText('楼里互助站')).toBeInTheDocument()
  })
})
