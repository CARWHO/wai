// Wai demo enclosure
// Parts: ESP32 core board (Jaycar XC3800), HC-SR04 (Jaycar XC4442), optional soil sensor wires (XC4604).
// Power: USB cable from a laptop. No battery inside.
// HC-SR04 sits on the floor with its transducers pointing down through two holes, over the water.
// ESP32 is taped upside down (pins up) by its metal RF shield with double-sided tape,
// USB end facing the cable notch. The pins stick out underneath, so it can't sit flat pins-down.
// All sizes in mm. Measure your parts and adjust the variables below before printing.

part = "assembly"; // "base", "lid", "assembly", "print", "demo" (with mock parts)

/* [Interior] */
in_l = 120;  // interior length (X): HC-SR04 + its jumpers + ESP32 + micro-USB plug
in_w = 50;   // interior width (Y)
in_h = 35;   // interior height, floor top to rim

/* [Shell] */
wall  = 2.5;
floor_t = 3;
corner_r = 4;

/* [HC-SR04] */
hc_pcb_l = 45;        // PCB length (along Y)
hc_pcb_w = 20;        // PCB width (along X)
hc_tx_pitch = 26;     // centre-to-centre of the two transducers
hc_hole_d = 18;       // transducers are ~16 mm; 1 mm clearance each side
hc_rail_h = 1.5;      // low locating rails around the PCB
hc_clear = 0.5;
hc_x = 4;             // gap from the end wall to the PCB

/* [Cable exits] */
usb_notch_w = 10;     // USB cable exit, notch from the rim (micro-USB plug stays inside)
usb_notch_d = 10;
soil_notch_w = 8;     // soil sensor wires
soil_notch_d = 8;

/* [Lid] */
lid_t = 2.5;
lip_h = 5;
lip_t = 1.6;
lid_clear = 0.25;     // per side; friction fit for PLA
label = "WAI";
label_size = 14;
label_depth = 0.6;

$fn = 64;

out_l = in_l + 2 * wall;
out_w = in_w + 2 * wall;
out_h = in_h + floor_t;

module rounded_box(l, w, h, r) {
    translate([r, r, 0])
        linear_extrude(h)
            offset(r = r) square([l - 2 * r, w - 2 * r]);
}

module base() {
    difference() {
        rounded_box(out_l, out_w, out_h, corner_r);
        // cavity
        translate([wall, wall, floor_t])
            rounded_box(in_l, in_w, in_h + 1, max(corner_r - wall, 0.5));

        // HC-SR04 transducer holes, centred across the width
        hc_cx = wall + hc_x + hc_pcb_w / 2;
        for (dy = [-hc_tx_pitch / 2, hc_tx_pitch / 2])
            translate([hc_cx, out_w / 2 + dy, -1])
                cylinder(d = hc_hole_d, h = floor_t + 2);

        // USB notch in the far end wall
        translate([out_l - wall - 1, out_w / 2 - usb_notch_w / 2, out_h - usb_notch_d])
            cube([wall + 2, usb_notch_w, usb_notch_d + 1]);

        // soil sensor notch in a long wall
        translate([out_l * 0.65, -1, out_h - soil_notch_d])
            cube([soil_notch_w, wall + 2, soil_notch_d + 1]);
    }

    // locating rails for the HC-SR04 PCB; open on the pin side (+X)
    rx = wall + hc_x - hc_clear;
    ry = out_w / 2 - hc_pcb_l / 2 - hc_clear;
    rl = hc_pcb_w + 2 * hc_clear;
    rw = hc_pcb_l + 2 * hc_clear;
    translate([0, 0, floor_t]) {
        translate([rx - 1.2, ry - 1.2, 0]) cube([1.2, rw + 2.4, hc_rail_h]);
        translate([rx - 1.2, ry - 1.2, 0]) cube([rl * 0.6, 1.2, hc_rail_h]);
        translate([rx - 1.2, ry + rw, 0]) cube([rl * 0.6, 1.2, hc_rail_h]);
    }
}

module lid() {
    difference() {
        union() {
            rounded_box(out_l, out_w, lid_t, corner_r);
            // lip that drops inside the base walls
            c = lid_clear;
            ir = max(corner_r - wall - c, 0.5);
            translate([wall + c, wall + c, -lip_h])
                difference() {
                    rounded_box(in_l - 2 * c, in_w - 2 * c, lip_h, ir);
                    translate([lip_t, lip_t, -1])
                        rounded_box(in_l - 2 * c - 2 * lip_t, in_w - 2 * c - 2 * lip_t,
                                    lip_h + 2, max(ir - lip_t, 0.5));
                }
        }
        // engraved label on the top face
        translate([out_l / 2, out_w / 2, lid_t - label_depth])
            linear_extrude(label_depth + 1)
                text(label, size = label_size, halign = "center", valign = "center",
                     font = "Liberation Sans:style=Bold");
        // cut the lip where the cable notches are so the lid seats over the cables
        translate([out_l - wall - lip_t - 2, out_w / 2 - usb_notch_w / 2, -lip_h - 1])
            cube([lip_t + 4, usb_notch_w, lip_h + 1]);
        translate([out_l * 0.65, wall - 1, -lip_h - 1])
            cube([soil_notch_w, lip_t + 3, lip_h + 1]);
    }
}

// Approximate parts, only for the "demo" render. Not printed.
demo_lid = true;
esp_l = 55; esp_w = 28; esp_pcb = 1.6; esp_shield = 3.2; tape_t = 1;
module mock_parts() {
    hc_x0 = wall + hc_x;
    hc_y0 = out_w / 2 - hc_pcb_l / 2;
    // HC-SR04: PCB on the floor, transducers down through the holes, pins toward +X
    translate([hc_x0, hc_y0, floor_t]) {
        color("royalblue") cube([hc_pcb_w, hc_pcb_l, esp_pcb]);
        for (dy = [-hc_tx_pitch / 2, hc_tx_pitch / 2])
            color("silver") translate([hc_pcb_w / 2, hc_pcb_l / 2 + dy, -floor_t - 9])
                cylinder(d = 16, h = floor_t + 9);
        for (i = [0:3])
            color("goldenrod") translate([hc_pcb_w, hc_pcb_l / 2 - 3.8 + i * 2.54, 0.5])
                cube([8, 0.64, 0.64]);
    }
    // ESP32 upside down: tape, RF shield, PCB, pins up. USB end at +X.
    ex0 = out_l - wall - 18 - esp_l;   // leave ~18 mm for the micro-USB plug
    ey0 = out_w / 2 - esp_w / 2;
    translate([ex0, ey0, floor_t]) {
        color("white") translate([2, 4, 0]) cube([18, 20, tape_t]);
        color("lightgray") translate([2, 5, tape_t]) cube([18, 18, esp_shield]);
        translate([0, 0, tape_t + esp_shield]) {
            color("black") cube([esp_l, esp_w, esp_pcb]);
            for (y = [1.3, esp_w - 1.3 - 0.64])
                for (i = [0:18])
                    color("goldenrod") translate([4 + i * 2.54, y, esp_pcb]) cube([0.64, 0.64, 8]);
            color("silver") translate([esp_l - 5, esp_w / 2 - 4, -3]) cube([6, 8, 3]); // micro-USB port
        }
        // micro-USB plug and cable out through the notch
        color("dimgray") translate([esp_l + 1, esp_w / 2 - 5.5, tape_t + esp_shield - 3]) cube([16, 11, 7]);
    }
    color("dimgray")
        hull() {
            translate([out_l - wall - 2, out_w / 2, floor_t + tape_t + esp_shield]) sphere(d = 4);
            translate([out_l - wall / 2, out_w / 2, out_h - usb_notch_d + 2]) sphere(d = 4);
        }
    color("dimgray") translate([out_l - wall / 2, out_w / 2, out_h - usb_notch_d + 2])
        rotate([0, 90, 0]) cylinder(d = 4, h = 25);
}

if (part == "base") base();
else if (part == "lid") translate([0, out_w, lid_t]) rotate([180, 0, 0]) lid();
else if (part == "print") {
    base();
    translate([0, 2 * out_w + 10, lid_t]) rotate([180, 0, 0]) lid();
}
else if (part == "demo") { // mock parts for a visual check, lid lifted
    color("gold") base();
    if (demo_lid) color("gold", 0.35) translate([0, 0, out_h + 30]) lid();
    mock_parts();
}
else { // assembly, lid lifted to show the inside
    base();
    translate([0, 0, out_h + 20]) lid();
}
