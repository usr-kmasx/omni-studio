#include <cassert>
#include <vector>
#include "core/image_crop.h"
#include "core/memory_budget.h"

static bool host;
static size_t free_bytes;
static size_t total_bytes;
static enum ggml_backend_dev_type type = GGML_BACKEND_DEVICE_TYPE_GPU;
bool ggml_backend_buft_is_host(ggml_backend_buffer_type_t) { return host; }
ggml_backend_dev_t ggml_backend_buft_get_device(ggml_backend_buffer_type_t) {
    return reinterpret_cast<ggml_backend_dev_t>(1);
}
void ggml_backend_dev_memory(ggml_backend_dev_t, size_t* free, size_t* total) {
    *free = free_bytes;
    *total = total_bytes;
}
enum ggml_backend_dev_type ggml_backend_dev_type(ggml_backend_dev_t) { return type; }
void log_printf(sd_log_level_t, const char*, int, const char*, ...) {}

static void test_crop() {
    std::vector<uint8_t> pixels(1920 * 1088 * 3);
    pixels[4 * 1920 * 3] = 42;
    pixels[(1083 * 1920 + 1919) * 3 + 2] = 99;
    sd_image_t full_hd{1920, 1088, 3, pixels.data()};
    assert(sd::center_crop(full_hd, 1920, 1080));
    assert(full_hd.width == 1920 && full_hd.height == 1080);
    assert(pixels.front() == 42);
    assert(pixels[1920 * 1080 * 3 - 1] == 99);

    uint8_t small[] = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14};
    sd_image_t odd{5, 3, 1, small};
    assert(sd::center_crop(odd, 2, 1));
    assert(small[0] == 6 && small[1] == 7);
    assert(sd::center_crop(odd, 2, 1));
    assert(!sd::center_crop(odd, 3, 1));
}

int main() {
    test_crop();
    constexpr uint64_t mib = 1024 * 1024;
    assert(sd::fits_ram_budget(512 * mib, 1024 * mib));
    assert(!sd::fits_ram_budget(513 * mib, 1024 * mib));
    assert(!sd::fits_ram_budget(1, 0));
    host = true;
    assert(!sd::memory_budget_allows("load", nullptr, SIZE_MAX));
    assert(sd::memory_budget_error.find("phase=load resource=ram") != std::string::npos);
    host = false;
    total_bytes = 8192 * mib;
    free_bytes = 2048 * mib;
    assert(sd::memory_budget_allows("load", nullptr, 1024 * mib));
    free_bytes = 1024 * mib;
    assert(!sd::memory_budget_allows("generation", nullptr, 1024 * mib));
    assert(sd::memory_budget_error.find("phase=generation resource=vram") != std::string::npos);
    assert(sd::memory_budget_allows("generation", nullptr, 256 * mib));
    free_bytes = total_bytes;
    assert(!sd::memory_budget_allows("load", nullptr, 256 * mib));
    assert(sd::memory_budget_error.find("resource=vram_unknown") != std::string::npos);
}
