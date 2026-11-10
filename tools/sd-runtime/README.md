# Protected image runtimes

Build on Linux x86-64 with CMake, Ninja, a C++17 compiler, Python 3.11 or newer,
Vulkan headers and loader, SPIRV-Headers, and glslc. Check out
`a3c49b13be5a64a0b4da2b576af3a17e8ae1ccbf` from
[stable-diffusion.cpp](https://github.com/leejet/stable-diffusion.cpp) in a
separate directory, then run:

```sh
tools/sd-runtime/build.sh /path/to/checkout /path/to/build /path/to/omni-image-runtimes
```

Place the resulting `omni-image-runtimes` directory alongside `omni-app`.
The app verifies each ZIP against its SHA-256 sidecar before extracting and
probes the runtime before using it. Runtime updates use a separate installation
directory, so the previous runtime and model configuration are preserved.
