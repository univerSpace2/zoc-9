import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { ToggleSwitch } from '@/components/ui/ToggleSwitch'

describe('ToggleSwitch', () => {
  test('renders switch semantics and calls onChange with toggled state', () => {
    const onChange = vi.fn()
    render(<ToggleSwitch checked={true} onChange={onChange} label="듀스 적용" description="현재: 적용" />)

    const toggle = screen.getByRole('switch', { name: '듀스 적용' })
    expect(toggle).toHaveAttribute('aria-checked', 'true')

    fireEvent.click(toggle)
    expect(onChange).toHaveBeenCalledWith(false)
  })
})
