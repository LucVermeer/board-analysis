CREATE INDEX "board_placements_board_type_layout_id_set_hole_idx" ON "board_placements" USING btree ("board_type","layout_id","id","set_id","hole_id");
