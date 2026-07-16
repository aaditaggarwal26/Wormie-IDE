import { describe, expect, it } from 'vitest'
import { classroomInviteFromArguments, classroomInviteLink, inviteCodeFrom } from './invite'

describe('inviteCodeFrom', () => {
  it('accepts a bare invite code', () => {
    expect(inviteCodeFrom('AABBCCDDEEFF00112233445566778899')).toBe('aabbccddeeff00112233445566778899')
  })

  it('extracts a code from a Wormie invite link', () => {
    expect(inviteCodeFrom('wormie://join/aabbccddeeff00112233445566778899')).toBe('aabbccddeeff00112233445566778899')
  })

  it('rejects malformed and oversized invitations', () => {
    expect(() => inviteCodeFrom('not-an-invite')).toThrow('valid Wormie classroom invite')
    expect(() => inviteCodeFrom('a'.repeat(33))).toThrow('valid Wormie classroom invite')
    expect(() => inviteCodeFrom('x'.repeat(501))).toThrow('too long')
  })
})

describe('classroomInviteLink', () => {
  it('canonicalizes a Wormie classroom link', () => {
    expect(classroomInviteLink('wormie://join/AABBCCDDEEFF00112233445566778899/')).toBe('wormie://join/aabbccddeeff00112233445566778899')
  })

  it('rejects other routes and decorated links', () => {
    expect(classroomInviteLink('https://join/aabbccddeeff00112233445566778899')).toBeNull()
    expect(classroomInviteLink('wormie://admin/aabbccddeeff00112233445566778899')).toBeNull()
    expect(classroomInviteLink('wormie://join/aabbccddeeff00112233445566778899?next=bad')).toBeNull()
  })

  it('finds a validated invite in process arguments', () => {
    expect(classroomInviteFromArguments(['wormie.exe', '--flag', 'wormie://join/aabbccddeeff00112233445566778899'])).toBe('wormie://join/aabbccddeeff00112233445566778899')
    expect(classroomInviteFromArguments(['wormie.exe', 'not-a-link'])).toBeNull()
  })
})
