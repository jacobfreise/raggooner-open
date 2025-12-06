package sumpf.web.backend.entity;

import jakarta.persistence.*;

import java.util.ArrayList;
import java.util.List;

@Entity
public class Tournament {
    @GeneratedValue
    @Id
    private Integer id;

    private Integer team_count = 3;

    //{25, 18, 15, 12, 10, 8, 6, 4, 2, 1}
    private List<Integer> points = new ArrayList<>();

    @OneToMany(mappedBy = "tournament", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<Team> teamList;
}
