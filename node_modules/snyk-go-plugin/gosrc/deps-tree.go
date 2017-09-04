package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"go/build"
	"os"
	"path"
	"sort"
	"strings"
)

/*
	This code is based on https://github.com/KyleBanks/depth
*/

// Pkg represents a Go source package, and its dependencies.
type Pkg struct {
	Name           string
	FullImportPath string
	SrcDir         string
	Depth          int

	Internal bool `json:"-"`
	Resolved bool

	Tree   *Tree `json:"-"`
	Parent *Pkg  `json:"-"`
	Deps   []Pkg `json:",omitempty"`

	Raw *build.Package `json:"-"`
}

// Resolve recursively finds all dependencies for the Pkg and the packages it depends on.
func (p *Pkg) Resolve() {
	// Resolved is always true, regardless of if we skip the import,
	// it is only false if there is an error while importing.
	p.Resolved = true

	name := p.cleanName()
	if name == "" {
		return
	}
	p.Depth = p.depth()

	// Stop resolving imports if we've reached a loop.
	var importMode build.ImportMode
	if p.Tree.hasSeenImport(name) && p.isAncestor(name) {
		importMode = build.FindOnly
	}

	pkg, err := build.Default.Import(name, p.SrcDir, importMode)
	if err != nil {
		// TODO: Check the error type?
		p.Resolved = false
		p.Tree.rememverUnresolvedPkg(name)
		return
	}
	p.Raw = pkg

	// Clear some too verbose fields
	p.Raw.ImportPos = nil
	p.Raw.TestImportPos = nil

	// Update the name with the fully qualified import path.
	p.FullImportPath = pkg.ImportPath

	// If this is an internal dependency, we don't resolve deeper
	if pkg.Goroot {
		p.Internal = true
		return
	}

	imports := pkg.Imports
	if p.Tree.ResolveTest {
		imports = append(imports, append(pkg.TestImports, pkg.XTestImports...)...)
	}

	p.setDeps(imports, pkg.Dir)
}

// setDeps takes a slice of import paths and the source directory they are relative to,
// and creates the Deps of the Pkg. Each dependency is also further resolved prior to being added
// to the Pkg.
func (p *Pkg) setDeps(imports []string, srcDir string) {
	unique := make(map[string]struct{})

	for _, imp := range imports {
		// Mostly for testing files where cyclic imports are allowed.
		if imp == p.Name {
			continue
		}

		// Skip duplicates.
		if _, ok := unique[imp]; ok {
			continue
		}
		unique[imp] = struct{}{}

		p.addDep(imp, srcDir)
	}

	sort.Sort(sortablePkgsList(p.Deps))
}

// addDep creates a Pkg and it's dependencies from an imported package name.
func (p *Pkg) addDep(name string, srcDir string) {
	dep := Pkg{
		Name:   name,
		SrcDir: srcDir,
		Tree:   p.Tree,
		Parent: p,
	}
	dep.Resolve()

	if dep.Internal || dep.Name == "C" {
		return
	}

	p.Deps = append(p.Deps, dep)
}

// depth returns the depth of the Pkg within the Tree.
func (p *Pkg) depth() int {
	if p.Parent == nil {
		return 0
	}

	return p.Parent.depth() + 1
}

// isAncestor goes recursively up the chain of Pkgs to determine if the name provided is ever a
// parent of the current Pkg.
func (p *Pkg) isAncestor(name string) bool {
	if p.Parent == nil {
		return false
	}

	if p.Parent.Name == name {
		return true
	}

	return p.Parent.isAncestor(name)
}

// cleanName returns a cleaned version of the Pkg name used for resolving dependencies.
//
// If an empty string is returned, dependencies should not be resolved.
func (p *Pkg) cleanName() string {
	name := p.Name

	// C 'package' cannot be resolved.
	if name == "C" {
		return ""
	}

	// Internal golang_org/* packages must be prefixed with vendor/
	//
	// Thanks to @davecheney for this:
	// https://github.com/davecheney/graphpkg/blob/master/main.go#L46
	if strings.HasPrefix(name, "golang_org") {
		name = path.Join("vendor", name)
	}

	return name
}

// sortablePkgsList ensures a slice of Pkgs are sorted such that the internal stdlib
// packages are always above external packages (ie. github.com/whatever).
type sortablePkgsList []Pkg

func (b sortablePkgsList) Len() int {
	return len(b)
}

func (b sortablePkgsList) Swap(i, j int) {
	b[i], b[j] = b[j], b[i]
}

func (b sortablePkgsList) Less(i, j int) bool {
	if b[i].Internal && !b[j].Internal {
		return true
	} else if !b[i].Internal && b[j].Internal {
		return false
	}

	return b[i].Name < b[j].Name
}

// Tree represents the top level of a Pkg and the configuration used to
// initialize and represent its contents.
type Tree struct {
	Root *Pkg

	ResolveTest bool

	UnresolvedPkgs map[string]struct{}

	importCache map[string]struct{}
}

// Resolve recursively finds all dependencies for the root Pkg name provided,
// and the packages it depends on.
func (t *Tree) Resolve(name string) error {
	pwd, err := os.Getwd()
	if err != nil {
		return err
	}

	t.Root = &Pkg{
		Name:   name,
		Tree:   t,
		SrcDir: pwd,
	}

	// Reset the import cache each time to ensure a reused Tree doesn't
	// reuse the same cache.
	t.importCache = map[string]struct{}{}
	t.UnresolvedPkgs = map[string]struct{}{}

	t.Root.Resolve()
	if !t.Root.Resolved {
		return errors.New("unable to resolve root package")
	}

	return nil
}

// hasSeenImport returns true if the import name provided has already been seen within the tree.
// This function only returns false for a name once.
func (t *Tree) hasSeenImport(name string) bool {
	if _, ok := t.importCache[name]; ok {
		return true
	}
	t.importCache[name] = struct{}{}
	return false
}

func (t *Tree) rememverUnresolvedPkg(name string) {
	t.UnresolvedPkgs[name] = struct{}{}
}

func prettyPrintJSON(j interface{}) {
	e := json.NewEncoder(os.Stdout)
	e.SetIndent("", "  ")
	e.Encode(j)
}

func main() {
	var t Tree
	err := t.Resolve(".")
	if err != nil {
		panic(err)
	}

	prettyPrintJSON(*t.Root)

	if len(t.UnresolvedPkgs) != 0 {
		fmt.Println("\nUnresolved packages:")

		for unresolved := range t.UnresolvedPkgs {
			fmt.Println(" - ", unresolved)
		}

		os.Exit(1)
	}
}
