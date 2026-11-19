// Quadric-error mesh simplifier (Garland & Heckbert edge collapse, iterative-threshold variant).
// Written for the Breaking City asset pipeline.
//
// Input  (binary): u32 nv, u32 nt, f32 pos[nv*3], f32 importance[nv], u32 tri[nt*3]
// Output (binary): u32 nv, u32 nt, f32 pos[nv*3], u32 tri[nt*3]
// Usage: qem <in> <out> <target triangles> [aggressiveness=7]
//
// importance multiplies a vertex's quadric, so important areas (face, hands) keep more
// triangles. Open-border vertices are locked so clothing edges keep their outline.
#include <cstdio>
#include <cstdlib>
#include <cstdint>
#include <cmath>
#include <vector>
#include <algorithm>

struct Sym {  // symmetric 4x4 matrix, 10 unique values
  double m[10];
  Sym(double c = 0) { for (double &x : m) x = c; }
  Sym(double a, double b, double c, double d) {  // plane ax+by+cz+d=0
    m[0] = a * a; m[1] = a * b; m[2] = a * c; m[3] = a * d;
    m[4] = b * b; m[5] = b * c; m[6] = b * d;
    m[7] = c * c; m[8] = c * d; m[9] = d * d;
  }
  Sym operator+(const Sym &o) const { Sym r; for (int i = 0; i < 10; i++) r.m[i] = m[i] + o.m[i]; return r; }
  Sym &operator+=(const Sym &o) { for (int i = 0; i < 10; i++) m[i] += o.m[i]; return *this; }
  Sym operator*(double s) const { Sym r; for (int i = 0; i < 10; i++) r.m[i] = m[i] * s; return r; }
  double det(int a11, int a12, int a13, int a21, int a22, int a23, int a31, int a32, int a33) const {
    return m[a11] * m[a22] * m[a33] + m[a13] * m[a21] * m[a32] + m[a12] * m[a23] * m[a31]
         - m[a13] * m[a22] * m[a31] - m[a11] * m[a23] * m[a32] - m[a12] * m[a21] * m[a33];
  }
};

struct V3 {
  double x, y, z;
  V3 operator+(const V3 &o) const { return {x + o.x, y + o.y, z + o.z}; }
  V3 operator-(const V3 &o) const { return {x - o.x, y - o.y, z - o.z}; }
  V3 operator*(double s) const { return {x * s, y * s, z * s}; }
  double dot(const V3 &o) const { return x * o.x + y * o.y + z * o.z; }
  V3 cross(const V3 &o) const { return {y * o.z - z * o.y, z * o.x - x * o.z, x * o.y - y * o.x}; }
  double len() const { return std::sqrt(dot(*this)); }
  V3 norm() const { double l = len(); return l > 1e-30 ? *this * (1.0 / l) : V3{0, 0, 0}; }
};

struct Tri { int v[3]; double err[4]; bool deleted = false, dirty = false; V3 n; };
struct Vert { V3 p; int tstart = 0, tcount = 0; Sym q; bool border = false; };
struct Ref { int tid, tvertex; };

static std::vector<Tri> tris;
static std::vector<Vert> verts;
static std::vector<Ref> refs;

static double vertexError(const Sym &q, double x, double y, double z) {
  const double *m = q.m;
  return m[0] * x * x + 2 * m[1] * x * y + 2 * m[2] * x * z + 2 * m[3] * x + m[4] * y * y
       + 2 * m[5] * y * z + 2 * m[6] * y + m[7] * z * z + 2 * m[8] * z + m[9];
}

// Error of collapsing edge (a,b); writes the best position to out.
static double edgeError(int a, int b, V3 &out) {
  Sym q = verts[a].q + verts[b].q;
  bool border = verts[a].border && verts[b].border;
  double det = q.det(0, 1, 2, 1, 4, 5, 2, 5, 7);
  if (det != 0 && !border) {
    out.x = -1 / det * q.det(1, 2, 3, 4, 5, 6, 5, 7, 8);
    out.y = 1 / det * q.det(0, 2, 3, 1, 5, 6, 2, 7, 8);
    out.z = -1 / det * q.det(0, 1, 3, 1, 4, 6, 2, 5, 8);
    return vertexError(q, out.x, out.y, out.z);
  }
  V3 p1 = verts[a].p, p2 = verts[b].p, p3 = (p1 + p2) * 0.5;
  double e1 = vertexError(q, p1.x, p1.y, p1.z), e2 = vertexError(q, p2.x, p2.y, p2.z), e3 = vertexError(q, p3.x, p3.y, p3.z);
  double e = std::min(e1, std::min(e2, e3));
  out = e == e1 ? p1 : e == e2 ? p2 : p3;
  return e;
}

// Would moving vertex i0 (collapsing towards i1) to p flip or squash a neighbour triangle?
static bool flipped(const V3 &p, int i0, int i1, std::vector<int> &deleted) {
  Vert &v0 = verts[i0];
  for (int k = 0; k < v0.tcount; k++) {
    Ref &r = refs[v0.tstart + k];
    Tri &t = tris[r.tid];
    if (t.deleted) continue;
    int s = r.tvertex;
    int id1 = t.v[(s + 1) % 3], id2 = t.v[(s + 2) % 3];
    if (id1 == i1 || id2 == i1) { deleted[k] = 1; continue; }
    V3 d1 = (verts[id1].p - p).norm(), d2 = (verts[id2].p - p).norm();
    if (std::fabs(d1.dot(d2)) > 0.999) return true;
    V3 n = d1.cross(d2).norm();
    deleted[k] = 0;
    if (n.dot(t.n) < 0.2) return true;
  }
  return false;
}

static void updateTriangles(int i0, Vert &v, std::vector<int> &deleted, int &deletedCount) {
  V3 p;
  for (int k = 0; k < v.tcount; k++) {
    Ref r = refs[v.tstart + k];
    Tri &t = tris[r.tid];
    if (t.deleted) continue;
    if (deleted[k]) { t.deleted = true; deletedCount++; continue; }
    t.v[r.tvertex] = i0;
    t.dirty = true;
    t.err[0] = edgeError(t.v[0], t.v[1], p);
    t.err[1] = edgeError(t.v[1], t.v[2], p);
    t.err[2] = edgeError(t.v[2], t.v[0], p);
    t.err[3] = std::min(t.err[0], std::min(t.err[1], t.err[2]));
    refs.push_back(r);
  }
}

static void rebuildRefs() {
  for (Vert &v : verts) { v.tstart = 0; v.tcount = 0; }
  for (Tri &t : tris) for (int j = 0; j < 3; j++) verts[t.v[j]].tcount++;
  int start = 0;
  for (Vert &v : verts) { v.tstart = start; start += v.tcount; v.tcount = 0; }
  refs.assign(tris.size() * 3, Ref{0, 0});
  for (size_t i = 0; i < tris.size(); i++) {
    Tri &t = tris[i];
    for (int j = 0; j < 3; j++) { Vert &v = verts[t.v[j]]; refs[v.tstart + v.tcount] = Ref{(int)i, j}; v.tcount++; }
  }
}

static void compactMesh(int iteration, const std::vector<float> &importance) {
  if (iteration > 0) {  // drop deleted triangles
    size_t dst = 0;
    for (size_t i = 0; i < tris.size(); i++) if (!tris[i].deleted) tris[dst++] = tris[i];
    tris.resize(dst);
  }
  rebuildRefs();
  if (iteration != 0) return;

  // First pass: find border vertices (edges used by only one triangle) and build quadrics.
  for (Vert &v : verts) v.border = false;
  std::vector<int> vcount, vids;
  for (size_t i = 0; i < verts.size(); i++) {
    Vert &v = verts[i];
    vcount.clear(); vids.clear();
    for (int j = 0; j < v.tcount; j++) {
      Tri &t = tris[refs[v.tstart + j].tid];
      for (int k = 0; k < 3; k++) {
        int id = t.v[k], ofs = 0;
        while (ofs < (int)vcount.size() && vids[ofs] != id) ofs++;
        if (ofs == (int)vcount.size()) { vcount.push_back(1); vids.push_back(id); } else vcount[ofs]++;
      }
    }
    for (size_t j = 0; j < vcount.size(); j++) if (vcount[j] == 1) verts[vids[j]].border = true;
  }
  for (Vert &v : verts) v.q = Sym(0.0);
  for (Tri &t : tris) {
    V3 p0 = verts[t.v[0]].p, p1 = verts[t.v[1]].p, p2 = verts[t.v[2]].p;
    V3 n = (p1 - p0).cross(p2 - p0);
    double area = n.len() * 0.5;
    n = n.norm();
    t.n = n;
    Sym plane = Sym(n.x, n.y, n.z, -n.dot(p0)) * area;  // area-weighted plane
    for (int j = 0; j < 3; j++) verts[t.v[j]].q += plane * importance[t.v[j]];
  }
  V3 p;
  for (Tri &t : tris) {
    for (int j = 0; j < 3; j++) t.err[j] = edgeError(t.v[j], t.v[(j + 1) % 3], p);
    t.err[3] = std::min(t.err[0], std::min(t.err[1], t.err[2]));
  }
}

int main(int argc, char **argv) {
  if (argc < 4) { fprintf(stderr, "usage: qem in out target [aggressiveness]\n"); return 1; }
  long target = atol(argv[3]);
  double aggressiveness = argc > 4 ? atof(argv[4]) : 7.0;
  FILE *f = fopen(argv[1], "rb");
  if (!f) { perror("in"); return 1; }
  uint32_t nv, nt;
  if (fread(&nv, 4, 1, f) != 1 || fread(&nt, 4, 1, f) != 1) return 1;
  std::vector<float> pos(nv * 3), importance(nv);
  std::vector<uint32_t> idx(nt * 3);
  if (fread(pos.data(), 4, pos.size(), f) != pos.size()) return 1;
  if (fread(importance.data(), 4, importance.size(), f) != importance.size()) return 1;
  if (fread(idx.data(), 4, idx.size(), f) != idx.size()) return 1;
  fclose(f);

  verts.resize(nv);
  for (uint32_t i = 0; i < nv; i++) verts[i].p = {pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]};
  tris.resize(nt);
  for (uint32_t i = 0; i < nt; i++) for (int j = 0; j < 3; j++) tris[i].v[j] = idx[i * 3 + j];

  // Scale-independent thresholds: normalise by the mesh's bounding size.
  double lo[3] = {1e30, 1e30, 1e30}, hi[3] = {-1e30, -1e30, -1e30};
  for (Vert &v : verts) { double c[3] = {v.p.x, v.p.y, v.p.z}; for (int k = 0; k < 3; k++) { lo[k] = std::min(lo[k], c[k]); hi[k] = std::max(hi[k], c[k]); } }
  double size = std::max(hi[0] - lo[0], std::max(hi[1] - lo[1], hi[2] - lo[2]));
  double unit = size * size * size * size;  // error ~ area * distance^2

  int deletedCount = 0;
  long startCount = tris.size();
  std::vector<int> del0, del1;
  for (int iteration = 0; iteration < 400; iteration++) {
    if ((long)(startCount - deletedCount) <= target) break;
    if (iteration % 5 == 0) compactMesh(iteration, importance);
    for (Tri &t : tris) t.dirty = false;
    double threshold = 1e-9 * std::pow(double(iteration + 3), aggressiveness) * unit * 1e-3;
    for (size_t i = 0; i < tris.size(); i++) {
      Tri &t = tris[i];
      if (t.err[3] > threshold || t.deleted || t.dirty) continue;
      for (int j = 0; j < 3; j++) {
        if (t.err[j] >= threshold) continue;
        int i0 = t.v[j], i1 = t.v[(j + 1) % 3];
        Vert &v0 = verts[i0], &v1 = verts[i1];
        if (v0.border != v1.border) continue;
        if (v0.border && v1.border) continue;  // keep open edges (sleeves, collars) intact
        V3 p;
        edgeError(i0, i1, p);
        del0.assign(v0.tcount, 0);
        del1.assign(v1.tcount, 0);
        if (flipped(p, i0, i1, del0) || flipped(p, i1, i0, del1)) continue;
        v0.p = p;
        v0.q = v1.q + v0.q;
        int tstart = refs.size();
        updateTriangles(i0, v0, del0, deletedCount);
        updateTriangles(i0, v1, del1, deletedCount);
        int tcount = refs.size() - tstart;
        if (tcount <= v0.tcount) {
          if (tcount) std::copy(refs.begin() + tstart, refs.begin() + tstart + tcount, refs.begin() + v0.tstart);
        } else v0.tstart = tstart;
        v0.tcount = tcount;
        break;
      }
      if ((long)(startCount - deletedCount) <= target) break;
    }
    if (iteration % 10 == 0) fprintf(stderr, "iter %d: %ld triangles\n", iteration, startCount - deletedCount);
  }
  compactMesh(1, importance);

  // Remove unused vertices and write out.
  std::vector<int> remap(verts.size(), -1);
  std::vector<float> outPos;
  for (Tri &t : tris) for (int j = 0; j < 3; j++) {
    int v = t.v[j];
    if (remap[v] < 0) { remap[v] = outPos.size() / 3; outPos.push_back(verts[v].p.x); outPos.push_back(verts[v].p.y); outPos.push_back(verts[v].p.z); }
  }
  std::vector<uint32_t> outIdx;
  for (Tri &t : tris) for (int j = 0; j < 3; j++) outIdx.push_back(remap[t.v[j]]);
  uint32_t onv = outPos.size() / 3, ont = tris.size();
  FILE *o = fopen(argv[2], "wb");
  fwrite(&onv, 4, 1, o); fwrite(&ont, 4, 1, o);
  fwrite(outPos.data(), 4, outPos.size(), o);
  fwrite(outIdx.data(), 4, outIdx.size(), o);
  fclose(o);
  fprintf(stderr, "done: %u vertices, %u triangles\n", onv, ont);
  return 0;
}
