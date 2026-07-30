 
import {expect} from 'chai'

import BranchList from '../../src/commands/branch/list/index.js'
import EphemeralStaticHostList from '../../src/commands/ephemeral/static_host/list/index.js'
import FunctionList from '../../src/commands/function/list/index.js'
import ReleaseList from '../../src/commands/release/list/index.js'
import StaticHostBuildList from '../../src/commands/static_host/build/list/index.js'
import StaticHostList from '../../src/commands/static_host/list/index.js'
import TenantList from '../../src/commands/tenant/list/index.js'
import UnitTestList from '../../src/commands/unit_test/list/index.js'
import WorkflowTestList from '../../src/commands/workflow_test/list/index.js'
import WorkspaceList from '../../src/commands/workspace/list/index.js'

/**
 * Guards the paging tier each list command belongs to.
 *
 * The Metadata API pages unevenly and these boundaries are easy to erode by
 * copy-pasting a flag block from a neighbouring command. Each assertion below
 * encodes a decision about what the backing endpoint actually supports.
 */
const flagsOf = (cmd: {flags: Record<string, unknown>}): string[] => Object.keys(cmd.flags)

describe('list command paging surface', () => {
  describe('envelope tier — endpoint returns curPage/nextPage', () => {
    it('function list exposes both page and per_page', () => {
      expect(flagsOf(FunctionList)).to.include.members(['page', 'per_page'])
    })

    it('unit_test list exposes both page and per_page', () => {
      expect(flagsOf(UnitTestList)).to.include.members(['page', 'per_page'])
    })

    it('workflow_test list exposes both page and per_page', () => {
      expect(flagsOf(WorkflowTestList)).to.include.members(['page', 'per_page'])
    })

    it('preserves the fetch-everything per_page default on unit_test list', () => {
      // Previously hardcoded to 10000. Dropping to the utility default of 50
      // would silently truncate results that used to come back whole.
      const perPage = UnitTestList.flags.per_page as {default?: number}
      expect(perPage.default).to.equal(10_000)
    })
  })

  describe('page-only-envelope tier — endpoint hardcodes per_page server-side', () => {
    it('static_host list exposes page but not per_page', () => {
      expect(flagsOf(StaticHostList)).to.include('page')
      expect(flagsOf(StaticHostList)).to.not.include('per_page')
    })

    it('static_host build list exposes page but not per_page', () => {
      expect(flagsOf(StaticHostBuildList)).to.not.include('per_page')
    })

    it('ephemeral static_host list exposes page but not per_page', () => {
      expect(flagsOf(EphemeralStaticHostList)).to.not.include('per_page')
    })

    it('documents the server-fixed page size on the page flag', () => {
      const page = StaticHostList.flags.page as {description?: string}
      expect(page.description).to.contain('100')
    })
  })

  describe('bare-array endpoints stay unpaged', () => {
    // These endpoints accept page/per_page but return no paging metadata, so the
    // CLI cannot describe position. Offering flags would mean inferring
    // has-more from page fullness, which is a guaranteed false positive when the
    // result set is an exact multiple of the page size.
    it('tenant list exposes no paging flags', () => {
      expect(flagsOf(TenantList)).to.not.include('page')
      expect(flagsOf(TenantList)).to.not.include('per_page')
    })

    it('release list exposes no paging flags', () => {
      expect(flagsOf(ReleaseList)).to.not.include('page')
      expect(flagsOf(ReleaseList)).to.not.include('per_page')
    })
  })

  describe('none tier — endpoint has no paging at all', () => {
    it('branch list exposes no paging flags', () => {
      expect(flagsOf(BranchList)).to.not.include('page')
      expect(flagsOf(BranchList)).to.not.include('per_page')
    })

    it('workspace list exposes no paging flags', () => {
      expect(flagsOf(WorkspaceList)).to.not.include('page')
      expect(flagsOf(WorkspaceList)).to.not.include('per_page')
    })
  })
})
