CREATE INDEX "board_placements_board_type_id_layout_set_hole_idx" ON "board_placements" USING btree ("board_type","id","layout_id","set_id","hole_id");
